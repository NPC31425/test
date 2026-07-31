self.addEventListener('install', (event) => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(clients.claim()));

self.addEventListener('fetch', (event) => {
    if (event.request.url.includes('mock_video.webm')) {
        // 继续使用 MDN 官方 WebM 视频（CORS 完美支持，国内直连无防火墙问题）
        const testVideoUrl = 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.webm';
        const shouldSimulateError = event.request.url.includes('error=true');

        event.respondWith(
            fetch(testVideoUrl, { mode: 'cors' })
                .then((response) => {
                    if (!response.ok) {
                        throw new Error(`MDN 视频请求失败: ${response.status}`);
                    }

                    if (!shouldSimulateError) {
                        return response; // 正常播放直接透传
                    }

                    // 💡 flower.webm 约 750KB，放行前 85% (约 640KB)
                    // 确保 FFmpegDemuxer 100% 完成 Header 解析并进入播放状态！
                    const contentLength = response.headers.get('content-length');
                    const totalBytes = contentLength ? parseInt(contentLength, 10) : 750 * 1024;
                    const cutoffBytes = Math.floor(totalBytes * 0.85);

                    const reader = response.body.getReader();
                    let bytesRead = 0;

                    const faultyStream = new ReadableStream({
                        start(controller) {
                            function pump() {
                                reader.read().then(({ done, value }) => {
                                    if (done) {
                                        controller.close();
                                        return;
                                    }
                                    bytesRead += value.byteLength;

                                    if (bytesRead >= cutoffBytes) {
                                        // 在视频播放到尾声前强行切断，触发 C++ PIPELINE_ERROR_READ
                                        controller.error(new TypeError('Simulated Mid-Stream Read Error'));
                                        return;
                                    }

                                    controller.enqueue(value);
                                    pump();
                                }).catch((err) => controller.error(err));
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
