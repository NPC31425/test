self.addEventListener('install', (event) => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(clients.claim()));

self.addEventListener('fetch', (event) => {
    if (event.request.url.includes('mock_video.webm')) {
        // 💡 换用 Google GCP 官方存储桶的 WebM 视频（无重定向，CORS 完整支持，绝对稳定）
        const testVideoUrl = 'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.webm';
        const shouldSimulateError = event.request.url.includes('error=true');

        event.respondWith(
            fetch(testVideoUrl, { mode: 'cors' })
                .then((response) => {
                    // 💡 1. 拦截 HTTP 异常，防止给 C++ 传递空字节
                    if (!response.ok) {
                        throw new Error(`远程视频拉取失败，HTTP 状态码: ${response.status}`);
                    }

                    if (!shouldSimulateError) {
                        return response; // 正常播放透传
                    }

                    // 💡 2. 动态计算 50% 字节断流位置
                    const contentLength = response.headers.get('content-length');
                    const totalBytes = contentLength ? parseInt(contentLength, 10) : 3 * 1024 * 1024;
                    const cutoffBytes = Math.floor(totalBytes * 0.5);

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
                                        // 播放到 50% 处强行切断 DataPipe
                                        controller.error(new TypeError('Simulated Mid-Stream Network Error'));
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
                    newHeaders.set('Accept-Ranges', 'bytes');

                    return new Response(faultyStream, {
                        status: 200,
                        statusText: 'OK',
                        headers: newHeaders
                    });
                })
                .catch((err) => {
                    console.error('[SW 拦截到异常]', err);
                    return new Response(`SW Fetch Error: ${err.message}`, { status: 500 });
                })
        );
    }
});
