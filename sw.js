self.addEventListener('install', (event) => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(clients.claim()));

self.addEventListener('fetch', (event) => {
    if (event.request.url.includes('mock_video.webm')) {
        const testVideoUrl = 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.webm';
        const shouldSimulateError = event.request.url.includes('error=true');

        event.respondWith(
            fetch(testVideoUrl, { mode: 'cors' })
                .then((response) => {
                    if (!response.ok) throw new Error(`MDN 请求失败: ${response.status}`);

                    if (!shouldSimulateError) {
                        return response; // 正常播放直接透传
                    }

                    const reader = response.body.getReader();
                    let bytesRead = 0;
                    // flower.webm 约 750KB
                    // 放行前 250KB (约 30%)：足够解析 Header 并启动播放
                    const cutoffBytes = 250 * 1024;

                    const faultyStream = new ReadableStream({
                        async start(controller) {
                            try {
                                while (true) {
                                    const { done, value } = await reader.read();
                                    if (done) {
                                        controller.close();
                                        return;
                                    }

                                    bytesRead += value.byteLength;
                                    controller.enqueue(value);

                                    // 当推送完 250KB 数据后，立即挂起传输
                                    if (bytesRead >= cutoffBytes) {
                                        // 暂停 1 秒，给前端足够时间触发 onplaying 并进入播放状态
                                        await new Promise(resolve => setTimeout(resolve, 1000));
                                        
                                        // 1秒后在 FFmpegDemuxer 读取后续数据时强行闭关数据管道
                                        controller.error(new TypeError('Simulated Mid-Stream Read Error'));
                                        return;
                                    }
                                }
                            } catch (err) {
                                controller.error(err);
                            }
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
