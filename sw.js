// 确保 SW 快速更新接管页面
self.addEventListener('install', (event) => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(clients.claim());
});

self.addEventListener('fetch', (event) => {
    if (event.request.url.includes('mock_video.webm')) {
        // 使用支持 CORS 的 WebM 视频源（全平台兼容，完美走 FFmpeg 管线）
        const testVideoUrl = 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.webm';
        const shouldSimulateError = event.request.url.includes('error=true');

        event.respondWith(
            fetch(testVideoUrl, { mode: 'cors' }).then((response) => {
                if (!shouldSimulateError) {
                    return response;
                }

                // 💡 关键机制：先放行前 512KB 字节，确保 FFmpegDemuxer 成功完成 Header 解析并进入播放状态。
                // 随后在读取后续 Video Frame 时强行中断，精准触发 host_->OnDemuxerError(PIPELINE_ERROR_READ)！
                const reader = response.body.getReader();
                let bytesRead = 0;
                const cutoffBytes = 512 * 1024; // 512KB

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
                                    // 模拟网络在播放中途突然断开 IO 管道
                                    controller.error(new TypeError('Simulated Runtime Network Read Error'));
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
