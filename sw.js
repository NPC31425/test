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
                        return response; // 正常播放透传
                    }

                    const reader = response.body.getReader();
                    let bytesRead = 0;
                    // 💡 硬性截断线：只放行前 150 KB
                    // 150 KB 足够完成 Header 解析，但又保证视频播放到第 1 秒时必然断流
                    const cutoffBytes = 150 * 1024;

                    const faultyStream = new ReadableStream({
                        async start(controller) {
                            try {
                                while (true) {
                                    const { done, value } = await reader.read();
                                    if (done) {
                                        controller.close();
                                        return;
                                    }

                                    // 💡 核心修复：如果当前 chunk 超过了 150KB 门槛，强制裁切！
                                    if (bytesRead + value.byteLength >= cutoffBytes) {
                                        const needed = cutoffBytes - bytesRead;
                                        if (needed > 0) {
                                            controller.enqueue(value.subarray(0, needed));
                                        }

                                        // 挂起 1 秒，让前端有足够时间触发 onplaying 画面
                                        await new Promise(r => setTimeout(r, 1000));

                                        // 1秒后在 Chromium 索要后续数据时，抛出 DataPipe 崩溃错误
                                        controller.error(new TypeError('Simulated Mid-Stream Network Error'));
                                        return;
                                    }

                                    bytesRead += value.byteLength;
                                    controller.enqueue(value);
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
