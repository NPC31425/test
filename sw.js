self.addEventListener('fetch', (event) => {
    if (event.request.url.includes('mock_video.mp4')) {
        const testVideoUrl = 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4';
        
        // 检查请求是否带有 error=true 参数
        const shouldSimulateError = event.request.url.includes('error=true');

        event.respondWith(
            fetch(testVideoUrl, { mode: 'cors' }).then((response) => {
                if (!shouldSimulateError) {
                    // 如果没有 error=true，返回正常完整视频
                    return response;
                }

                // 带有 error=true 时，才切断数据流
                const reader = response.body.getReader();
                let bytesRead = 0;
                const maxBytes = 100 * 1024;

                const faultyStream = new ReadableStream({
                    start(controller) {
                        function pump() {
                            reader.read().then(({ done, value }) => {
                                if (done) { controller.close(); return; }
                                bytesRead += value.byteLength;
                                if (bytesRead >= maxBytes) {
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

                return new Response(faultyStream, {
                    headers: response.headers,
                    status: response.status,
                    statusText: response.statusText
                });
            })
        );
    }
});
