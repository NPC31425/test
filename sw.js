self.addEventListener('install', (event) => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(clients.claim()));

self.addEventListener('fetch', (event) => {
    if (event.request.url.includes('mock_video.webm')) {
        const testVideoUrl = 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.webm';
        const shouldSimulateError = event.request.url.includes('error=true');

        event.respondWith(
            fetch(testVideoUrl, { mode: 'cors' })
                .then((response) => {
                    if (!response.ok) throw new Error(`Fetch 失败: ${response.status}`);

                    if (!shouldSimulateError) {
                        return response; // 正常播放直接透传
                    }

                    const reader = response.body.getReader();
                    let isAborted = false;

                    const faultyStream = new ReadableStream({
                        start(controller) {
                            // 💡 关键：延迟 1.5 秒后再闭关数据管道
                            // 这 1.5 秒足够 FFmpegDemuxer 解析完 Header 并让视频开始播放
                            setTimeout(() => {
                                isAborted = true;
                                controller.error(new TypeError('Simulated Mid-Stream Network Failure'));
                            }, 1500);

                            function pump() {
                                reader.read().then(({ done, value }) => {
                                    if (isAborted) return; // 已中断，不再继续

                                    if (done) {
                                        controller.close();
                                        return;
                                    }

                                    controller.enqueue(value);
                                    pump();
                                }).catch((err) => {
                                    if (!isAborted) controller.error(err);
                                });
                            }
                            pump();
                        }
                    });

                    const newHeaders = new Headers(response.headers);
                    newHeaders.set('Access-Control-Allow-Origin', '*');
                    newHeaders.set('Content-Type', 'video/webm');

                    return new Response(faultyStream, {
                        status: 200,
                        statusText: 'OK',
                        headers: newHeaders
                    });
                })
        );
    }
});
