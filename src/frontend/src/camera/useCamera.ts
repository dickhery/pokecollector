import { useCallback, useEffect, useRef, useState } from "react";

export interface CameraConfig {
  facingMode?: "user" | "environment";
  width?: number;
  height?: number;
  quality?: number;
  format?: "image/jpeg" | "image/png" | "image/webp";
}

export interface CameraError {
  type: "permission" | "not-supported" | "not-found" | "unknown";
  message: string;
}

/** CSS-pixel crop rectangle measured from the video element's rendered bounds. */
export interface CssCropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const useCamera = (config: CameraConfig = {}) => {
  const {
    facingMode = "environment",
    width = 1920,
    height = 1080,
    quality = 0.8,
    format = "image/jpeg",
  } = config;

  const [isActive, setIsActive] = useState(false);
  const [isSupported, setIsSupported] = useState<boolean | null>(null);
  const [error, setError] = useState<CameraError | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [currentFacingMode, setCurrentFacingMode] = useState(facingMode);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const isMountedRef = useRef(true);

  // Check browser support
  useEffect(() => {
    const supported = !!navigator.mediaDevices?.getUserMedia;
    setIsSupported(supported);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      cleanup();
    };
  }, []);

  const cleanup = useCallback(() => {
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        track.stop();
      }
      streamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setIsActive(false);
  }, []);

  const createMediaStream = useCallback(
    async (facing: "user" | "environment") => {
      try {
        const constraints = {
          video: {
            facingMode: facing,
            width: { ideal: width },
            height: { ideal: height },
          },
        };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);

        if (!isMountedRef.current) {
          for (const track of stream.getTracks()) {
            track.stop();
          }
          return null;
        }

        return stream;
      } catch (err: any) {
        let errorType: CameraError["type"] = "unknown";
        let errorMessage = "Failed to access camera";

        if (err.name === "NotAllowedError") {
          errorType = "permission";
          errorMessage = "Camera permission denied";
        } else if (err.name === "NotFoundError") {
          errorType = "not-found";
          errorMessage = "No camera device found";
        } else if (err.name === "NotSupportedError") {
          errorType = "not-supported";
          errorMessage = "Camera is not supported";
        }

        throw { type: errorType, message: errorMessage };
      }
    },
    [width, height],
  );

  const setupVideo = useCallback(async (stream: MediaStream) => {
    if (!videoRef.current) return false;

    const video = videoRef.current;
    video.srcObject = stream;

    return new Promise<boolean>((resolve) => {
      const onLoadedMetadata = () => {
        video.removeEventListener("loadedmetadata", onLoadedMetadata);
        video.removeEventListener("error", onError);

        // Try to play the video
        video.play().catch((err) => {
          console.warn("Video autoplay failed:", err);
          // This is often okay - user interaction might be needed
        });

        resolve(true);
      };

      const onError = () => {
        video.removeEventListener("loadedmetadata", onLoadedMetadata);
        video.removeEventListener("error", onError);
        resolve(false);
      };

      video.addEventListener("loadedmetadata", onLoadedMetadata);
      video.addEventListener("error", onError);

      // Handle case where metadata is already loaded
      if (video.readyState >= 1) {
        onLoadedMetadata();
      }
    });
  }, []);

  const startCamera = useCallback(async (): Promise<boolean> => {
    if (isSupported === false || isLoading) {
      return false;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Clean up any existing stream
      cleanup();

      const stream = await createMediaStream(currentFacingMode);
      if (!stream) return false;

      streamRef.current = stream;
      const success = await setupVideo(stream);

      if (success && isMountedRef.current) {
        setIsActive(true);
        return true;
      }

      cleanup();
      return false;
    } catch (err: any) {
      if (isMountedRef.current) {
        setError(err);
      }

      cleanup();
      return false;
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [
    isSupported,
    isLoading,
    currentFacingMode,
    cleanup,
    createMediaStream,
    setupVideo,
  ]);

  const stopCamera = useCallback(async (): Promise<void> => {
    if (isLoading) return;

    setIsLoading(true);
    cleanup();
    setError(null);

    // Small delay to ensure cleanup is complete
    await new Promise((resolve) => setTimeout(resolve, 100));

    if (isMountedRef.current) {
      setIsLoading(false);
    }
  }, [isLoading, cleanup]);

  const switchCamera = useCallback(
    async (newFacingMode?: "user" | "environment"): Promise<boolean> => {
      if (isSupported === false || isLoading) {
        return false;
      }

      const targetFacingMode =
        newFacingMode ||
        (currentFacingMode === "user" ? "environment" : "user");

      setIsLoading(true);
      setError(null);

      try {
        // Clean up current stream
        cleanup();

        // Update facing mode
        setCurrentFacingMode(targetFacingMode);

        // Small delay to ensure cleanup
        await new Promise((resolve) => setTimeout(resolve, 100));

        const stream = await createMediaStream(targetFacingMode);
        if (!stream) return false;

        streamRef.current = stream;
        const success = await setupVideo(stream);

        if (success && isMountedRef.current) {
          setIsActive(true);
          return true;
        }

        cleanup();
        return false;
      } catch (err: any) {
        if (isMountedRef.current) {
          setError(err);
        }

        cleanup();
        return false;
      } finally {
        if (isMountedRef.current) {
          setIsLoading(false);
        }
      }
    },
    [
      isSupported,
      isLoading,
      currentFacingMode,
      cleanup,
      createMediaStream,
      setupVideo,
    ],
  );

  const retry = useCallback(async (): Promise<boolean> => {
    if (isLoading) return false;

    setError(null);
    await stopCamera();
    await new Promise((resolve) => setTimeout(resolve, 200));
    return startCamera();
  }, [isLoading, stopCamera, startCamera]);

  const capturePhoto = useCallback((): Promise<File | null> => {
    return new Promise((resolve) => {
      if (!videoRef.current || !canvasRef.current || !isActive) {
        resolve(null);
        return;
      }

      const video = videoRef.current;
      const canvas = canvasRef.current;

      // Set canvas size to match video
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(null);
        return;
      }

      // Mirror front camera image
      if (currentFacingMode === "user") {
        ctx.scale(-1, 1);
        ctx.drawImage(video, -canvas.width, 0);
      } else {
        ctx.drawImage(video, 0, 0);
      }

      canvas.toBlob(
        (blob) => {
          if (blob) {
            const extension = format.split("/")[1];
            const file = new File([blob], `photo_${Date.now()}.${extension}`, {
              type: format,
            });
            resolve(file);
          } else {
            resolve(null);
          }
        },
        format,
        quality,
      );
    });
  }, [isActive, format, quality, currentFacingMode]);

  /**
   * Capture only the region of the video that corresponds to the CSS-pixel
   * rectangle `cssRect` (measured relative to the video element's rendered
   * bounding box).  Correctly handles `object-fit: cover` scaling so the
   * crop exactly matches what the user sees inside the viewfinder overlay.
   *
   * Falls back to a full-frame capture if crop calculation fails.
   */
  const capturePhotoWithCrop = useCallback(
    (cssRect: CssCropRect): Promise<File | null> => {
      return new Promise((resolve) => {
        if (!videoRef.current || !canvasRef.current || !isActive) {
          resolve(null);
          return;
        }

        const video = videoRef.current;
        const cropCanvas = canvasRef.current;

        try {
          const videoNativeW = video.videoWidth;
          const videoNativeH = video.videoHeight;

          // Rendered size of the <video> element
          const rendered = video.getBoundingClientRect();
          const renderedW = rendered.width;
          const renderedH = rendered.height;

          if (
            renderedW === 0 ||
            renderedH === 0 ||
            videoNativeW === 0 ||
            videoNativeH === 0
          ) {
            console.warn(
              "[crop] zero-size element, falling back to full frame",
            );
            resolve(capturePhoto());
            return;
          }

          // With object-fit: cover the video is scaled uniformly so that it
          // completely fills the element.  We need to find:
          //   scale  -- the uniform scale factor from native to rendered pixels
          //   offsetX/Y -- how many rendered pixels are clipped off each edge
          const scaleX = renderedW / videoNativeW;
          const scaleY = renderedH / videoNativeH;
          const scale = Math.max(scaleX, scaleY); // cover = take the larger scale

          // Size of the native video if rendered at `scale`
          const scaledW = videoNativeW * scale;
          const scaledH = videoNativeH * scale;

          // Pixel offset of the scaled frame inside the element (centred)
          const offsetX = (renderedW - scaledW) / 2;
          const offsetY = (renderedH - scaledH) / 2;

          // Convert the CSS-pixel crop rect to native video coordinates
          const nativeLeft = (cssRect.x - offsetX) / scale;
          const nativeTop = (cssRect.y - offsetY) / scale;
          const nativeWidth = cssRect.width / scale;
          const nativeHeight = cssRect.height / scale;

          // Clamp to [0, native dimensions]
          const clampedLeft = Math.max(0, nativeLeft);
          const clampedTop = Math.max(0, nativeTop);
          const clampedRight = Math.min(videoNativeW, nativeLeft + nativeWidth);
          const clampedBottom = Math.min(
            videoNativeH,
            nativeTop + nativeHeight,
          );
          const clampedW = clampedRight - clampedLeft;
          const clampedH = clampedBottom - clampedTop;

          console.log(
            `[crop] native crop: ${Math.round(clampedLeft)},${Math.round(clampedTop)} ` +
              `${Math.round(clampedW)}x${Math.round(clampedH)} ` +
              `(from native ${videoNativeW}x${videoNativeH})`,
          );

          if (clampedW <= 0 || clampedH <= 0) {
            console.warn(
              "[crop] degenerate crop rect, falling back to full frame",
            );
            resolve(capturePhoto());
            return;
          }

          cropCanvas.width = clampedW;
          cropCanvas.height = clampedH;

          const ctx = cropCanvas.getContext("2d");
          if (!ctx) {
            resolve(capturePhoto());
            return;
          }

          ctx.drawImage(
            video,
            clampedLeft,
            clampedTop,
            clampedW,
            clampedH, // source
            0,
            0,
            clampedW,
            clampedH, // destination
          );

          cropCanvas.toBlob(
            (blob) => {
              if (blob) {
                const ext = format.split("/")[1];
                resolve(
                  new File([blob], `crop_${Date.now()}.${ext}`, {
                    type: format,
                  }),
                );
              } else {
                resolve(capturePhoto());
              }
            },
            format,
            quality,
          );
        } catch (err) {
          console.warn("[crop] error, falling back to full frame:", err);
          resolve(capturePhoto());
        }
      });
    },
    [isActive, format, quality, capturePhoto],
  );

  return {
    // State
    isActive,
    isSupported,
    error,
    isLoading,
    currentFacingMode,

    // Actions
    startCamera,
    stopCamera,
    capturePhoto,
    capturePhotoWithCrop,
    switchCamera,
    retry,

    // Refs for components
    videoRef,
    canvasRef,
  };
};
