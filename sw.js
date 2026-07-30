// 确保 Service Worker 立即生效并接管页面
self.addEventListener('install', (event) => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(clients.claim());
});

self.addEventListener('fetch', (event) => {
    // 拦截对虚拟视频地址的请求
    if (event.request.url.includes('mock_video.mp4')) {
        // 使用 MDN 官方维护的 CC0 测试视频（原生支持 CORS 跨域）
        const testVideoUrl = 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4';

        event.respondWith(
            fetch(testVideoUrl, { mode: 'cors' }).then((response) => {
                const reader = response.body.getReader();
                let bytesRead = 0;
                // 100KB 限制：足以支持 FFmpeg 顺利解析 Moov/Header，但会在读取后续 Frame 数据时崩溃
                const maxBytes = 100 * 1024; 

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
                                    // 核心：在 DataPipe 管道中途主动抛出错误，直接触发底层 OnDataSourceError
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
