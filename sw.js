// 确保 Service Worker 立即更新并接管页面
self.addEventListener('install', (event) => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(clients.claim());
});

self.addEventListener('fetch', (event) => {
    if (event.request.url.includes('mock_video.mp4')) {
        // 使用 MDN 官方支持 CORS 跨域的视频资源
        const testVideoUrl = 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.webm';
        const shouldSimulateError = event.request.url.includes('error=true');

        event.respondWith(
            fetch(testVideoUrl, { mode: 'cors' }).then((response) => {
                // 正常播放请求直接透传
                if (!shouldSimulateError) {
                    return response;
                }

                // 带 error=true 时，读取满 100KB 后切断 DataPipe 管道
                const reader = response.body.getReader();
                let bytesRead = 0;
                const maxBytes = 100 * 1024; // 100KB

                const faultyStream = new ReadableStream({
                    start(controller) {
                        function pump() {
                            reader.read().then(({ done, value }) => {
                                if (done) {
                                    controller.close();
                                    return;
                                }
                                bytesRead += value.byteLength;

                                if (bytesRead >= maxBytes) {
                                    // 在流的中途主动触发错误，直接传导给 C++ 层
                                    controller.error(new TypeError('Simulated Network IO Error'));
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

                return new Response(faultyStream, {
                    headers: newHeaders,
                    status: response.status,
                    statusText: response.statusText
                });
            })
        );
    }
});
