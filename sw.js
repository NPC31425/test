// 确保 Service Worker 立即更新并接管页面
self.addEventListener('install', (event) => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(clients.claim());
});

self.addEventListener('fetch', (event) => {
    // 拦截对虚拟视频地址的请求
    if (event.request.url.includes('mock_video.mp4')) {
        const testVideoUrl = 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.webm';
        
        // 检查请求中是否带有 error=true 参数
        const shouldSimulateError = event.request.url.includes('error=true');

        event.respondWith(
            fetch(testVideoUrl, { mode: 'cors' }).then((response) => {
                // 如果是正常播放请求，直接透传完整视频流
                if (!shouldSimulateError) {
                    return response;
                }

                // 如果带有 error=true，读取 100KB 后切断 DataPipe 管道
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
                                    // 在流的中途主动触发错误，直接触发 C++ 层的 OnDataSourceError
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
