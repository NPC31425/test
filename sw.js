// 快速跳过等待并接管控制权
self.addEventListener('install', (event) => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(clients.claim());
});

self.addEventListener('fetch', (event) => {
    if (event.request.url.includes('mock_video.webm')) {
        // 使用维基共享资源的 Big Buck Bunny VP9 WebM 测试视频（兼容性与 CORS 完美支持）
        const testVideoUrl = 'https://upload.wikimedia.org/wikipedia/commons/transcoded/c/c0/Big_Buck_Bunny_4K_H264_30fps.mp4/Big_Buck_Bunny_4K_H264_30fps.mp4.480p.vp9.webm';
        const shouldSimulateError = event.request.url.includes('error=true');

        event.respondWith(
            fetch(testVideoUrl, { mode: 'cors' }).then((response) => {
                if (!shouldSimulateError) {
                    return response;
                }

                // 💡 1. 动态获取视频总大小，计算 50% 的断流位置
                const contentLength = response.headers.get('content-length');
                // 默认保底 2MB
                const totalBytes = contentLength ? parseInt(contentLength, 10) : 2048 * 1024; 
                const cutoffBytes = Math.floor(totalBytes * 0.5); // 播放到 50% 时精准切断

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
                                    // 💡 在播放中途（50% 字节处）强行切断管道，触发 C++ PIPELINE_ERROR_READ
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

                // 💡 2. 补全必要的 Header，防止 C++ 在 Initialize 阶段拒收格式
                const newHeaders = new Headers(response.headers);
                newHeaders.set('Access-Control-Allow-Origin', '*');
                newHeaders.set('Content-Type', 'video/webm');
                newHeaders.set('Accept-Ranges', 'bytes');

                return new Response(faultyStream, {
                    status: response.status,
                    statusText: response.statusText,
                    headers: newHeaders
                });
            })
        );
    }
});
