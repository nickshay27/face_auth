import React, { useEffect, useRef, useState } from "react";
import * as faceapi from "face-api.js";
import AuthIdle from "../assets/images/auth-idle.svg";
import AuthFace from "../assets/images/auth-face.svg";
import { Navigate, useLocation, useNavigate } from "react-router-dom";

function Login() {
  const [tempAccount, setTempAccount] = useState(null);
  const [localUserStream, setLocalUserStream] = useState(null);
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [loginResult, setLoginResult] = useState("PENDING");
  const [imageError, setImageError] = useState(false);
  const [faceDetected, setFaceDetected] = useState(false);
  const [counter, setCounter] = useState(2);
  const [labeledFaceDescriptors, setLabeledFaceDescriptors] = useState(null);
  const videoRef = useRef();
  const canvasRef = useRef();
  const faceApiIntervalRef = useRef();
  const videoWidth = 640;
  const videoHeight = 360;

  const location = useLocation();
  const navigate = useNavigate();

  if (!location?.state) {
    return <Navigate to="/" replace={true} />;
  }

  const loadModels = async () => {
    const uri = "/models";
    await Promise.all([
      faceapi.nets.ssdMobilenetv1.loadFromUri(uri),
      faceapi.nets.faceLandmark68Net.loadFromUri(uri),
      faceapi.nets.faceRecognitionNet.loadFromUri(uri),
      faceapi.nets.ageGenderNet.loadFromUri(uri),
      faceapi.nets.faceExpressionNet.loadFromUri(uri),
      faceapi.nets.tinyFaceDetector.loadFromUri(uri),
    ]);
    setModelsLoaded(true);
  };

  useEffect(() => {
    if (location.state?.account) {
      setTempAccount(location.state.account);
    }
  }, [location]);

  useEffect(() => {
    if (tempAccount) {
      loadModels()
        .then(() => loadLabeledImages())
        .then((labeledDescriptors) => {
          setLabeledFaceDescriptors(labeledDescriptors);
        });
    }
  }, [tempAccount]);

  useEffect(() => {
    if (faceDetected) {
      setLoginResult("SUCCESS");
    } else {
      setLoginResult("FAILED");
    }
  }, [faceDetected]);

  useEffect(() => {
    if (loginResult === "SUCCESS") {
      const counterInterval = setInterval(() => {
        setCounter((counter) => counter - 1);
      }, 1000);

      if (counter === 0) {
        videoRef.current.pause();
        videoRef.current.srcObject = null;
        localUserStream.getTracks().forEach((track) => {
          track.stop();
        });
        clearInterval(counterInterval);
        clearInterval(faceApiIntervalRef.current);
        localStorage.setItem(
          "faceAuth",
          JSON.stringify({ status: true, account: tempAccount })
        );
        navigate("/protected", { replace: true });
      }

      return () => clearInterval(counterInterval);
    }
  }, [loginResult, counter, localUserStream, navigate, tempAccount]);

  const getLocalUserVideo = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { width: videoWidth, height: videoHeight },
      });
      videoRef.current.srcObject = stream;
      setLocalUserStream(stream);
      scanFace();
    } catch (err) {
      console.error("error:", err);
    }
  };

  const scanFace = async () => {
    faceapi.matchDimensions(canvasRef.current, videoRef.current);
    const startTime = Date.now();
    const maxDetectionTime = 10000; // Increased time to 10 seconds
    faceApiIntervalRef.current = setInterval(async () => {
      const detections = await faceapi
        .detectAllFaces(videoRef.current, new faceapi.SsdMobilenetv1Options())
        .withFaceLandmarks()
        .withFaceDescriptors()
        .withAgeAndGender()
        .withFaceExpressions();

      const resizedDetections = faceapi.resizeResults(detections, {
        width: videoWidth,
        height: videoHeight,
      });

      const faceMatcher = new faceapi.FaceMatcher(labeledFaceDescriptors, 0.6);
      const results = resizedDetections.map((d) =>
        faceMatcher.findBestMatch(d.descriptor)
      );

      if (canvasRef.current) {
        const context = canvasRef.current.getContext("2d");
        context.clearRect(0, 0, videoWidth, videoHeight);
        faceapi.draw.drawDetections(canvasRef.current, resizedDetections);
        faceapi.draw.drawFaceLandmarks(canvasRef.current, resizedDetections);
        faceapi.draw.drawFaceExpressions(canvasRef.current, resizedDetections);
      }

      if (results.length > 0 && results[0].label === tempAccount.id) {
        setFaceDetected(true);
        clearInterval(faceApiIntervalRef.current);
      }

      if (Date.now() - startTime > maxDetectionTime) {
        clearInterval(faceApiIntervalRef.current);
        if (!faceDetected) {
          setLoginResult("FAILED");
        }
      }
    }, 100);
  };

  const loadLabeledImages = async () => {
    if (!tempAccount) {
      return null;
    }
    const descriptions = [];
    try {
      const imgPath =
        tempAccount.type === "CUSTOM"
          ? tempAccount.picture
          : `/temp-accounts/${tempAccount.picture}`;
      const img = await faceapi.fetchImage(imgPath);
      const detections = await faceapi
        .detectSingleFace(img)
        .withFaceLandmarks()
        .withFaceDescriptor();

      if (detections) {
        descriptions.push(detections.descriptor);
      }
    } catch {
      setImageError(true);
      return null;
    }

    return new faceapi.LabeledFaceDescriptors(tempAccount.id, descriptions);
  };

  if (imageError) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-6 max-w-xl mx-auto">
        <h2 className="text-center text-3xl font-extrabold text-rose-700">
          Upps! There is no profile picture associated with this account.
        </h2>
        <p className="text-center">
          Please contact administration for registration or try again later.
        </p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col items-center justify-center gap-6 max-w-xl mx-auto">
      {!localUserStream && !modelsLoaded && (
        <h2 className="text-center text-3xl font-extrabold text-gray-900">
          Loading Models...
        </h2>
      )}
      {!localUserStream && modelsLoaded && (
        <h2 className="text-center text-3xl font-extrabold text-gray-900">
          Please Recognize Your Face to Log In.
        </h2>
      )}
      {localUserStream && loginResult === "SUCCESS" && (
        <h2 className="text-center text-3xl font-extrabold text-indigo-600">
          We've successfully recognized your face! Please stay {counter} more
          seconds...
        </h2>
      )}
      {localUserStream && loginResult === "FAILED" && (
        <h2 className="text-center text-3xl font-extrabold text-rose-700">
          Upps! We did not recognize your face.
        </h2>
      )}
      {localUserStream && loginResult === "PENDING" && (
        <h2 className="text-center text-3xl font-extrabold text-gray-900">
          Scanning Face...
        </h2>
      )}
      <div className="w-full">
        <div className="relative flex flex-col items-center p-2">
          <video
            muted
            autoPlay
            ref={videoRef}
            height={videoHeight}
            width={videoWidth}
            style={{
              objectFit: "fill",
              height: "360px",
              borderRadius: "10px",
              display: localUserStream ? "block" : "none",
            }}
            onPlay={() => setTimeout(() => scanFace(), 500)}
          />
          <canvas
            ref={canvasRef}
            style={{
              position: "absolute",
              top: "10px",
              zIndex: 999,
              display: localUserStream ? "block" : "none",
            }}
          />
        </div>
        {!localUserStream ? (
          modelsLoaded ? (
            <>
              <img
                alt="scan your face"
                onClick={getLocalUserVideo}
                src={AuthFace}
                className="cursor-pointer my-8 mx-auto object-cover h-36 w-36"
              />
              <p className="text-center text-sm text-gray-500">
                Click on the image to start face recognition and log in.
              </p>
            </>
          ) : (
            <>
              <img
                alt="models loading"
                src={AuthIdle}
                className="animate-spin-slow my-8 mx-auto object-cover h-36 w-36"
              />
              <button
                type="button"
                disabled
                className="disabled:opacity-50 disabled:cursor-not-allowed text-white bg-indigo-600 hover:bg-indigo-700 font-medium rounded-lg text-sm px-5 py-2.5 text-center"
              >
                <svg
                  aria-hidden="true"
                  role="status"
                  className="inline w-4 h-4 mr-3 text-white animate-spin"
                  viewBox="0 0 100 101"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M100 50.5908C100 78.2051 77.6142 100.591 50 100.591C22.3858 100.591 0 78.2051 0 50.5908C0 22.9766 22.3858 0.59082 50 0.59082C77.6142 0.59082 100 22.9766 100 50.5908ZM9.08144 50.5908C9.08144 73.1895 27.4013 91.5094 50 91.5094C72.5987 91.5094 90.9186 73.1895 90.9186 50.5908C90.9186 27.9921 72.5987 9.67226 50 9.67226C27.4013 9.67226 9.08144 27.9921 9.08144 50.5908Z"
                    fill="currentColor"
                  />
                  <path
                    d="M93.9676 39.0409C96.393 38.4038 97.8624 35.9116 97.0079 33.5539C95.2932 28.8227 92.871 24.3692 89.8167 20.348C85.8452 15.1192 80.8826 10.7238 75.2124 7.41289C69.5422 4.10194 63.2754 1.94025 56.7698 1.05124C51.7666 0.367541 46.6976 0.446843 41.7345 1.27873C39.2613 1.69328 37.813 4.19778 38.4501 6.62326C39.0873 9.04874 41.5694 10.4717 44.0505 10.1071C47.8511 9.54855 51.7191 9.52689 55.5402 10.0491C60.8642 10.7766 65.9928 12.5457 70.6331 15.2552C75.2735 17.9648 79.3347 21.5619 82.5849 25.841C84.9175 28.9121 86.7997 32.2913 88.1811 35.8758C89.083 38.2158 91.5421 39.6781 93.9676 39.0409Z"
                    fill="#1C64F2"
                  />
                </svg>
                Please wait while models are loading...
              </button>
            </>
          )
        ) : null}
      </div>
    </div>
  );
}

export default Login;
