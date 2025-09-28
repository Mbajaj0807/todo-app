import { useState, useRef, useEffect } from "react";
import jsQR from "jsqr";

const API_BASE_URL =
  import.meta.env?.VITE_API_BASE_URL || "http://localhost:3000";

// QR Scanner Component
function QrScanner({ onScan, onError, isActive }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [hasCamera, setHasCamera] = useState(true);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [zoomRange, setZoomRange] = useState({ min: 1, max: 1, step: 1 });
  const scanIntervalRef = useRef(null);
  const streamRef = useRef(null);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "environment",
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();

        videoRef.current.onloadedmetadata = () => {
          // Get camera track
          const [track] = stream.getVideoTracks();
          const capabilities = track.getCapabilities();

          if (capabilities.zoom) {
            setZoomRange({
              min: capabilities.zoom.min,
              max: capabilities.zoom.max,
              step: capabilities.zoom.step || 1,
            });
            setZoomLevel(capabilities.zoom.min);
            track.applyConstraints({ advanced: [{ zoom: capabilities.zoom.min }] });
          }

          startScanning();
        };
      }
    } catch (err) {
      console.error("Camera access error:", err);
      setHasCamera(false);
      onError("Camera access denied or not available");
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
    }
  };

  const startScanning = () => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    scanIntervalRef.current = setInterval(() => {
      if (video.readyState === video.HAVE_ENOUGH_DATA) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        try {
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(imageData.data, canvas.width, canvas.height);

          if (code?.data) {
            onScan(code.data);
          }
        } catch (err) {
          console.error("Scanning error:", err);
        }
      }
    }, 300);
  };

  const handleZoomChange = async (e) => {
    const newZoom = Number(e.target.value);
    setZoomLevel(newZoom);

    if (streamRef.current) {
      const [track] = streamRef.current.getVideoTracks();
      try {
        await track.applyConstraints({ advanced: [{ zoom: newZoom }] });
      } catch (err) {
        console.warn("Zoom not supported:", err);
      }
    }
  };

  useEffect(() => {
    if (isActive && hasCamera) {
      startCamera();
    } else {
      stopCamera();
    }

    return () => stopCamera();
  }, [isActive, hasCamera]);

  if (!hasCamera) {
    return (
      <div
        style={{
          padding: "2rem",
          textAlign: "center",
          background: "#fef2f2",
          border: "1px solid #fca5a5",
          borderRadius: "12px",
          color: "#991b1b",
        }}
      >
        <div style={{ fontSize: "2rem", marginBottom: "1rem" }}>📷</div>
        <div>Camera not available</div>
        <div
          style={{
            fontSize: "0.875rem",
            opacity: 0.8,
            marginTop: "0.5rem",
          }}
        >
          Please check camera permissions or enter manually
        </div>
      </div>
    );
  }

  return (
    <div>
      <div
        style={{
          position: "relative",
          borderRadius: "12px",
          overflow: "hidden",
          background: "#000",
        }}
      >
        <video
          ref={videoRef}
          style={{
            width: "100%",
            height: "300px",
            objectFit: "cover",
          }}
          playsInline
          muted
        />
        <canvas ref={canvasRef} style={{ display: "none" }} />
      </div>

      {/* Zoom Slider */}
      {zoomRange.max > zoomRange.min && (
        <div style={{ marginTop: "1rem", textAlign: "center" }}>
          <label style={{ fontSize: "0.9rem", marginRight: "0.5rem" }}>
            Zoom:
          </label>
          <input
            type="range"
            min={zoomRange.min}
            max={zoomRange.max}
            step={zoomRange.step}
            value={zoomLevel}
            onChange={handleZoomChange}
          />
        </div>
      )}
    </div>
  );
}

export default function TodoApp() {
  const [taskInput, setTaskInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState({ text: null, isSuccess: false });
  const [showQrScanner, setShowQrScanner] = useState(false);

  const handleAddTask = async (attendanceId = null) => {
    const inputValue = attendanceId || taskInput.trim();

    if (!inputValue) {
      setMessage({
        text: "Please enter a task or scan QR",
        isSuccess: false,
      });
      return;
    }

    setIsLoading(true);
    setMessage({ text: null, isSuccess: false });

    try {
      const response = await fetch(`${API_BASE_URL}/api/mark-all-present`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attendanceId: inputValue }),
      });

      if (!response.ok) {
        throw new Error("Failed to communicate with the server.");
      }

      const result = await response.json();

      const failedUsers = result.summary.filter(
        (user) => user.data?.output?.data?.code === "ATTENDANCE_NOT_VALID"
      );

      if (failedUsers.length === 0) {
        setMessage({
          text: "✅ Task completed successfully!",
          isSuccess: true,
        });
        setTaskInput("");
        setShowQrScanner(false);
      } else {
        const failedMessages = failedUsers.map((user) => {
          const email = user.email;
          const reasonCode = user.data?.output?.data?.code;
          return `${email.slice(0, 11).toUpperCase()}: ${reasonCode}`;
        });

        setMessage({
          text: `❌ Some tasks failed:\n${failedMessages.join("\n")}`,
          isSuccess: false,
        });
      }
    } catch (err) {
      console.error("Error processing task:", err);
      setMessage({
        text: "❌ Failed to process task. Please try again.",
        isSuccess: false,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleQrScan = (scannedData) => {
    console.log("QR Code scanned:", scannedData);
    setTaskInput(scannedData);
    setShowQrScanner(false);
    handleAddTask(scannedData);
  };

  const handleQrError = (error) => {
    console.error("QR Scanner error:", error);
    setMessage({ text: error, isSuccess: false });
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
        padding: "2rem 1rem",
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}
    >
      <div
        style={{
          maxWidth: "600px",
          margin: "0 auto",
          background: "rgba(255, 255, 255, 0.95)",
          borderRadius: "20px",
          boxShadow: "0 20px 40px rgba(0, 0, 0, 0.1)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            background: "linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)",
            color: "white",
            padding: "2rem",
            textAlign: "center",
          }}
        >
          <h1 style={{ fontSize: "2rem", fontWeight: "700", margin: 0 }}>
            📋 Todo App
          </h1>
          <p style={{ margin: 0, opacity: 0.9 }}>
            Add tasks manually or scan QR
          </p>
        </div>

        <div style={{ padding: "2rem" }}>
          {message.text && (
            <div
              style={{
                padding: "1rem",
                borderRadius: "12px",
                marginBottom: "1rem",
                whiteSpace: "pre-line",
                background: message.isSuccess ? "#d1fae5" : "#fee2e2",
                color: message.isSuccess ? "#065f46" : "#991b1b",
                border: `1px solid ${
                  message.isSuccess ? "#a7f3d0" : "#fca5a5"
                }`,
              }}
            >
              {message.text}
            </div>
          )}

          {showQrScanner && (
            <div style={{ marginBottom: "1.5rem" }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginBottom: "0.5rem",
                }}
              >
                <strong>QR Scanner</strong>
                <button
                  onClick={() => setShowQrScanner(false)}
                  style={{
                    border: "none",
                    background: "transparent",
                    cursor: "pointer",
                  }}
                >
                  ✕
                </button>
              </div>
              <QrScanner
                onScan={handleQrScan}
                onError={handleQrError}
                isActive={showQrScanner}
              />
            </div>
          )}

          <div style={{ display: "flex", gap: "0.5rem" }}>
            <input
              type="text"
              value={taskInput}
              onChange={(e) => setTaskInput(e.target.value)}
              placeholder="Enter a task..."
              style={{
                flex: 1,
                padding: "1rem",
                borderRadius: "12px",
                border: "2px solid #e5e7eb",
              }}
              disabled={isLoading}
              onKeyPress={(e) => {
                if (e.key === "Enter" && taskInput.trim() && !isLoading) {
                  handleAddTask();
                }
              }}
            />
            <button
              onClick={() => setShowQrScanner(!showQrScanner)}
              disabled={isLoading}
              style={{
                padding: "1rem",
                borderRadius: "12px",
                border: "none",
                background: showQrScanner
                  ? "linear-gradient(135deg, #ef4444, #dc2626)"
                  : "linear-gradient(135deg, #059669, #047857)",
                color: "white",
                fontWeight: "600",
              }}
            >
              {showQrScanner ? "Close" : "QR"}
            </button>
            <button
              onClick={() => handleAddTask()}
              disabled={isLoading || !taskInput.trim()}
              style={{
                padding: "1rem",
                borderRadius: "12px",
                border: "none",
                background:
                  "linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)",
                color: "white",
                fontWeight: "600",
              }}
            >
              {isLoading ? "Processing..." : "Add"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
