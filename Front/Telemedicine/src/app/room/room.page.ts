import { Component, OnInit } from '@angular/core';
import {ActivatedRoute} from "@angular/router";
import { Socket } from 'ngx-socket-io';
import {v4 as uuid} from 'uuid';
import * as poseDetection from '@tensorflow-models/pose-detection';
import * as tf from '@tensorflow/tfjs-core';
import '@tensorflow/tfjs-backend-webgl';
import '@tensorflow/tfjs-backend-wasm';

declare const Peer: any;

interface VideoElement {
  muted: boolean;
  srcObject: MediaStream;
  userId: string;
  showVideo: boolean;
}

@Component({
  selector: 'app-room',
  templateUrl: './room.page.html',
  styleUrls: ['./room.page.scss'],
})

export class RoomPage implements OnInit {
  currentUserId: string = uuid();
  videos: VideoElement[] = []; // Initialize videos array
  chestPointRelative = { x: 0, y: 0 }; // relative position of clicked point in the bounding box
  userHasSelectedPoint = false;  // flag
  detector!: poseDetection.PoseDetector;
  firstJoinedUserId: string | null = null;
  trackingStarted: boolean = false;
  trackingButtonDisabled: boolean = true;
  keypointDistancesAndAngles: { [keypointName: string]: { distance: number, angle: number } } = {};
  // Newly added:
  areAllMuted: boolean = false; //New
  areAllVideosVisible: boolean = true; //New
  selectedDeviceId: string;  // New
  audioDevices: MediaDeviceInfo[] = [];  // New

  constructor(private route: ActivatedRoute, private socket: Socket) {
    this.selectedDeviceId = ""
  }

  ngOnInit() {
    const myPeer = new Peer(this.currentUserId, {
      host: 'calm-eyrie-60770-c940c0d2a787.herokuapp.com',
      port: 443,
      secure: true,
    });

  // Before Deploying in Heroku
    // const myPeer = new Peer(this.currentUserId, {
    //  host: 'localhost',
    //  port: 3001,
    //});

// NEW
//this.socket.on('point-selected', (chestPointRelative: { x: number, y: number }) => {
  this.socket.on('point-selected', (selectedPoint: { x: number, y: number }) => {
  this.drawTrackedPoint(selectedPoint);
  console.log(`Received 'point-selected' event with data:`, selectedPoint);
});

    //*****************************NEW**********************************//
    navigator.mediaDevices.enumerateDevices()
    .then((devices) => {
      this.audioDevices = devices.filter(device => device.kind === 'audioinput');
    })
    .catch((err) => {
      console.error('Error enumerating devices:', err);
    });

    //**********************************NEW******************************//
    let stream: MediaStream | null = null;
    this.route.params.subscribe((params) => {
      console.log(params);
      myPeer.on('open', (userId: any) => {
        this.socket.emit('join-room', params['roomId'], userId);
        this.loadPosenetModel();
      });
    });

    navigator.mediaDevices.getUserMedia({
      audio: {
        noiseSuppression: false, //Disable noise reduction
        deviceId: this.selectedDeviceId, //New Here
      },
      video: true,
    })
    .catch((err) => {
      console.error('Not able to retrieve user media:', err);
      return null;
    })
    .then((mediaStream: MediaStream | null) => {
      stream = mediaStream;
      if (stream) {
        this.addMyVideo(stream);
      }

      myPeer.on('call', (call: { answer: (arg0: MediaStream | null) => void; on: (arg0: string, arg1: { (otherUserVideoStream: MediaStream): void; (err: any): void; }) => void; metadata: { userId: string; }; }) => {
        console.log('receiving call...', call);
        call.answer(stream);
        call.on('stream', (otherUserVideoStream: MediaStream) => {
          console.log('receiving other stream', otherUserVideoStream);
          this.addOtherUserVideo(call.metadata.userId, otherUserVideoStream);
        });
        call.on('error', (err: any) => {
          console.error(err);
        });
      });
    });

    this.socket.on('user-connected', (userId: string) => {
      console.log('Receiving user-connected event', `Calling ${userId}`);
      setTimeout(() => {
        const call = myPeer.call(userId, stream, {
          metadata: { userId: this.currentUserId},
        });
        call.on('stream', (otherUserVideoStream: MediaStream) => {
          console.log('receiving other user stream after his connection');
          this.addOtherUserVideo(userId, otherUserVideoStream);
        });

        call.on('close', () => {
          this.videos = this.videos.filter((video) => video.userId !== userId);
        });
      }, 1000);
    });

    this.socket.on('user-disconnected', (userId: string) => {
      console.log(`Receiving user disconnect event from ${userId}`);
      this.videos = this.videos.filter(video => video.userId !== userId);
      if (userId === this.firstJoinedUserId) {
        this.firstJoinedUserId = null;
        this.trackingStarted = false;
        // Here, disable the button again as the first joined user has disconnected
        this.trackingButtonDisabled = true;
      }
    });
  }

  addMyVideo(stream: MediaStream) {
    this.videos.push({
      muted: true,
      srcObject: stream,
      userId: this.currentUserId,
      showVideo: true,
    });
  }

 // toggleMute(video: VideoElement) {
 //   video.muted = !video.muted;
 // }

  addOtherUserVideo(userId: string, stream: MediaStream) {
    const alreadyExisting = this.videos.some(video => video.userId === userId);
    if (alreadyExisting) {
      console.log(this.videos, userId);
      return;
    }

// Change Here
    const videoElement: VideoElement = {
      muted: false,
      srcObject: stream,
      userId,
      showVideo: true,
    };

// If this is the first video being added, start pose detection on it.
    if (this.firstJoinedUserId === null) {
      this.firstJoinedUserId = userId;
      // Here, enable the button since the first joined user is available
      this.trackingButtonDisabled = false;
      this.videos.unshift(videoElement); // Add the video at the beginning of the array
  } else {
    this.videos.push(videoElement);
    }
  }

  onLoadedMetaData(event: Event) {
    const video = event.target as HTMLVideoElement;
    video.play();
    const canvas = document.getElementById('canvas') as HTMLCanvasElement;
    if (canvas) {
      canvas.width = video.offsetWidth;
      canvas.height = video.offsetHeight;
    }
    // Check if we need to draw a point
    if (this.userHasSelectedPoint) {
      this.drawTrackedPointOnCanvas(canvas, video);
     }
    }

  drawTrackedPointOnCanvas(canvas: HTMLCanvasElement, video: HTMLVideoElement) {
    const ctx = canvas.getContext('2d');
    if (ctx) {
      // Calculate the actual position of the tracked point
      const x = this.chestPointRelative.x * video.offsetWidth;
      const y = this.chestPointRelative.y * video.offsetHeight;
      // Draw the tracked point
      ctx.beginPath();
      ctx.arc(x, y, 10, 0, 2 * Math.PI); // Draw a circle at the tracked point
      ctx.fillStyle = 'red';
      ctx.fill();
    }
  }

  async startPoseDetectionOnVideo(video: VideoElement) {
    // Here we start pose detection on the given video.
    // However, we can't directly access the video DOM element from `video` object.
    // We will need to find the corresponding video DOM element using `video.userId`.
    if (!this.detector) {
      await this.loadPosenetModel();
      if (!this.detector) {
        console.error('Detector not loaded');
      return;
      }}

    // Access video DOM element from video.srcObject (which is a MediaStream object)
    const videoDomElement = this.getVideoDomElementFromUserId(video.userId);
    if (!videoDomElement) {
      console.error(`Cannot find video DOM element for user ${video.userId}`);
      return;
    }
    // Now we can perform pose estimation on this video
    const poses = await this.detector.estimatePoses(videoDomElement);
}

  getVideoDomElementFromUserId(userId: string): HTMLVideoElement | null {
    const videoElement = document.getElementById(userId) as HTMLVideoElement;
    return videoElement;
  }

  //TRACKING METHODS BELOW
  // Use firstJoinedUserId to get the video DOM element in the methods where you need to perform pose detection:
  async loadPosenetModel() {
    try{
      // set the backend explicitly
      await tf.setBackend('webgl');
      const modelConfig = {
        modelType: poseDetection.movenet.modelType.MULTIPOSE_LIGHTNING,
        enableTracking: true,
        trackerType: poseDetection.TrackerType.BoundingBox
      }
      this.detector = await poseDetection.createDetector(poseDetection.SupportedModels.MoveNet, modelConfig);
      if (this.firstJoinedUserId === null) {
        console.error(`firstJoinedUserId is null`);
       return;
}
      const videoDomElement = this.getVideoDomElementFromUserId(this.firstJoinedUserId);  // Use firstJoinedUserId here
      if (!videoDomElement) {
        console.error(`Cannot find video DOM element for user ${this.firstJoinedUserId}`);
        return;
      }
      const pose = await this.detector.estimatePoses(videoDomElement);
      //console.log('pose',pose[0].keypoints);
    } catch (error) {
      console.error("Error in model loading or initial pose estimation: ", error);
    }
  }

  async estimatePose() {
    if (!this.detector) {
      return; // Handle the case when the model is not loaded
    }
    if (this.firstJoinedUserId === null) {
      console.error(`firstJoinedUserId is null`);
      return;
    }
    const video = this.getVideoDomElementFromUserId(this.firstJoinedUserId);
    if (!video) {
      return; // The video element for the first joined user hasn't been created yet
    }
    const image = tf.browser.fromPixels(video);
    const resizedImage = tf.image.resizeBilinear(image, [video.offsetHeight, video.offsetWidth]);
    const poses = await this.detector.estimatePoses(resizedImage);
    image.dispose();
    resizedImage.dispose();
    // Assuming the first pose is the target person
    const targetPose = poses[0];
    if (!targetPose) return null;
    // Calculate position of the selected point
    let totalX = 0;
    let totalY = 0;
    let count = 0;
    for (const keypoint of targetPose.keypoints) {
      if (keypoint.score && keypoint.score > 0.5) { // Check if the keypoint is visible
        if (keypoint.name) {
          const distanceAndAngle = this.keypointDistancesAndAngles[keypoint.name];
          if (distanceAndAngle) {
            const dx = distanceAndAngle.distance * Math.cos(distanceAndAngle.angle);
            const dy = distanceAndAngle.distance * Math.sin(distanceAndAngle.angle);
            const pointX = keypoint.x + dx;
            const pointY = keypoint.y + dy;
            totalX += pointX;
            totalY += pointY;
            count++;
          }
        }
      }
    }
    if (count > 0) {
      const selectedPointX = totalX / count;
      const selectedPointY = totalY / count;
}
    return targetPose;
}

  drawKeypoints(keypoints: poseDetection.Keypoint[]) {
    const canvas = document.getElementById('canvas') as HTMLCanvasElement;
    const ctx = canvas.getContext('2d');
   // const stethoscopeImage = document.getElementById('stethoscope') as HTMLImageElement;
    if (this.firstJoinedUserId === null) {
      console.error(`firstJoinedUserId is null`);
      return;
    }
    const video = this.getVideoDomElementFromUserId(this.firstJoinedUserId);
    if (!video || !ctx) {
      return; // Either the video element for the first joined user hasn't been created yet or the context is null
    }
    const leftShoulder = keypoints[5];
    const rightShoulder = keypoints[6];
    const chestX = (leftShoulder.x + rightShoulder.x) / 2;
    const chestY = (leftShoulder.y + rightShoulder.y) / 2;
    const scaleWidth = video.offsetWidth / video.videoWidth;
    const scaleHeight = video.offsetHeight / video.videoHeight;
    canvas.width = video ? video.videoWidth : canvas.width;
    canvas.height = video ? video.videoHeight : canvas.height;
    ctx.clearRect(0, 0, canvas.width, canvas.height); // Clear previous drawings
    keypoints.forEach(keypoint => {
      keypoint.x *= scaleWidth;
      keypoint.y *= scaleHeight;
      if (keypoint.score && keypoint.score > 0.5) { // Only draw keypoints with a high confidence score
        ctx.beginPath();//use x for width and y for height
        ctx.arc(keypoint.x, keypoint.y, 5, 0, 2 * Math.PI); // Draw a circle at the keypoint
        ctx.fillStyle = 'aqua';
        ctx.fill();
      }
    });
    // Calculate position of the tracked point
    const chestPointRelativeScaled = {
      x: this.chestPointRelative.x * scaleWidth,
      y: this.chestPointRelative.y * scaleHeight
    };
    if (this.userHasSelectedPoint) {
      const trackedPointX = chestX * scaleWidth + chestPointRelativeScaled.x;
      const trackedPointY = chestY * scaleHeight + chestPointRelativeScaled.y;
      //console.log(`Tracked point: (${trackedPointX}, ${trackedPointY})`);
      // Draw tracked point
      ctx.beginPath();
      ctx.arc(trackedPointX, trackedPointY, 10, 0, 2 * Math.PI);
      ctx.fillStyle = 'red';
      ctx.fill();
    }
    const chestWidth = Math.sqrt(Math.pow(rightShoulder.x - leftShoulder.x, 2) + Math.pow(rightShoulder.y - leftShoulder.y, 2));
    this.drawBoundingBox(chestX, chestY, chestWidth, chestWidth); // draw bounding box around the chest
    //console.log(`Video dimensions: ${video.videoWidth}x${video.videoHeight}`);
    //console.log(`Element dimensions: ${video.offsetWidth}x${video.offsetHeight}`);
  }

  drawBoundingBox(x: number, y: number, width: number, height: number) {
    const canvas = document.getElementById('canvas') as HTMLCanvasElement;
    const ctx = canvas.getContext('2d');
    const chestYOffset = 70; // Adjust as needed
    if (this.firstJoinedUserId === null) {
      console.error(`firstJoinedUserId is null`);
      return;
    }
    const video = this.getVideoDomElementFromUserId(this.firstJoinedUserId);
    if (!video || !ctx) {
      return; // Either the video element for the first joined user hasn't been created yet or the context is null
    }
    const scaleWidth = video.offsetWidth / video.videoWidth;
    const scaleHeight = video.offsetHeight / video.videoHeight;
    x *= scaleWidth;
    y *= scaleHeight;
    width *= scaleWidth;
    height *= scaleHeight;
    if (ctx) {
      ctx.beginPath();
      ctx.rect(x - width / 2, (y - height / 2)+chestYOffset, width, height+ chestYOffset);
      ctx.strokeStyle = 'purple';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  calculateDistanceAndAngle(point1: { x: number, y: number }, point2: { x: number, y: number }) {
    const dx = point2.x - point1.x;
    const dy = point2.y - point1.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const angle = Math.atan2(dy, dx);
    return { distance, angle };
    }

  async onCanvasClick(event: MouseEvent) {
    console.log("Canvas clicked"); //  debugging line
    const canvas = document.getElementById('canvas') as HTMLCanvasElement;
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const pose = await this.estimatePose();
    if (!pose) return; // No pose detected
    // Calculate distance and angle to all keypoints
    this.keypointDistancesAndAngles = {};
    for (const keypoint of pose.keypoints) {
      if (keypoint.x && keypoint.y) {
        const distanceAndAngle = this.calculateDistanceAndAngle(
          { x, y }, // position of the selected point
          keypoint, // position of the keypoint
        );
        if (keypoint.name) {
          this.keypointDistancesAndAngles[keypoint.name] = distanceAndAngle;
        }
      }
    }
    const leftShoulder = pose.keypoints.find(kp => kp.name == 'left_shoulder');
    const rightShoulder = pose.keypoints.find(kp => kp.name == 'right_shoulder');
    if (this.firstJoinedUserId === null) {
      console.error(`firstJoinedUserId is null`);
      return;
    }
    if (!leftShoulder || !rightShoulder) return;
    const video = this.getVideoDomElementFromUserId(this.firstJoinedUserId);
    const chestX = (leftShoulder.x + rightShoulder.x) / 2;
    const chestY = (leftShoulder.y + rightShoulder.y) / 2;
    const scaleWidth = video? video.offsetWidth / video.videoWidth: 1;
    const scaleHeight = video? video.offsetHeight / video.videoHeight:1 ;
    this.chestPointRelative.x = (x / scaleWidth) - chestX;
    this.chestPointRelative.y = (y / scaleHeight) - chestY;
    this.userHasSelectedPoint = true;  // Set flag to true when user selects a point
    console.log(`Selected point: (${x}, ${y})`);

//NEW
    this.socket.emit('point-selected', this.chestPointRelative);
    // Emit 'point-selected' event with the relative position of the selected point
    // Emit 'point-selected' event with the relative position of the selected point
    const selectedPoint = { x: x / scaleWidth, y: y / scaleHeight };
    console.log(`Emitting 'point-selected' event with data:`, selectedPoint);
    this.socket.emit('point-selected', selectedPoint);
  }

  async startPoseDetection() {
    if (!this.trackingStarted) {
        this.trackingStarted = true;
        if (this.firstJoinedUserId !== null) {
            const video = this.videos.find(v => v.userId === this.firstJoinedUserId);
            if (video) {
              tf.setBackend('webgl');
              await tf.ready();
              await this.loadPosenetModel();
              // Enable pointer events for the canvas and add the click event listener
              const canvas = document.getElementById('canvas') as HTMLCanvasElement;
              if (canvas) {
                canvas.style.pointerEvents = 'auto';
                canvas.addEventListener('click', (event: MouseEvent) => this.onCanvasClick(event));
              }

              setInterval(async () => {
                const targetPose = await this.estimatePose();
                if (targetPose) {
                  this.drawKeypoints(targetPose.keypoints);
                  //this.drawSkeleton(targetPose.keypoints);
                  //this.drawFacialLines(targetPose.keypoints);
                  // added code
                  // After keypoints are drawn, update and draw the received point
                  if(this.userHasSelectedPoint){
                    const leftShoulder = targetPose.keypoints.find(kp => kp.name == 'left_shoulder')!;
                    const rightShoulder = targetPose.keypoints.find(kp => kp.name == 'right_shoulder')!;
                    const chestX = (leftShoulder.x + rightShoulder.x) / 2;
                    const chestY = (leftShoulder.y + rightShoulder.y) / 2;
                    const trackedPointX = chestX + this.chestPointRelative.x;
                    const trackedPointY = chestY + this.chestPointRelative.y;

 // Emit the updated position of the tracked point to the server
 /// this.socket.emit('point-selected', {x: trackedPointX, y: trackedPointY});
 this.socket.emit('point-selected', {x: trackedPointX, y: trackedPointY, userId:video.userId});  /// There is a change here
 // Draw the tracked point on the sender's video
 //this.drawTrackedPoint({x: trackedPointX, y: trackedPointY});
}
                } else {
                  console.log('No target pose detected.');
                }
              }, 100); // Adjust the interval as needed. 100ms = 10 frames per second.            } else {
                console.error("First joined user's video not found");
                this.trackingStarted = false; }
        } else {
            console.error("No users in the video");
            this.trackingStarted = false;
        }
    }
  }

/********************************************************New Added Methods***************************************************************/
  // Try 1 Another function
  toggleMute(video: VideoElement) {
    if (video.userId === this.currentUserId) {
      video.muted = !video.muted;
    }
}

  toggleVideo(video: VideoElement) {
    if (video.userId === this.currentUserId) {
      video.showVideo = !video.showVideo;
    }
}

// Try 2
  toggleMuteAll() {
    this.areAllMuted = !this.areAllMuted;
    this.videos.forEach(video => {
      if (video.userId === this.currentUserId) {
        video.muted = this.areAllMuted;
      }});}

  toggleVideoAll() {
    this.areAllVideosVisible = !this.areAllVideosVisible;
    this.videos.forEach(video => {
      if (video.userId === this.currentUserId) {
        video.showVideo = this.areAllVideosVisible;
      }
   });
  }

  setupCall(deviceId: string) {
    navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: deviceId,
        noiseSuppression: false,
        autoGainControl: false,
      },
      video: true
    })
    .catch((err) => {
      console.error('Not able to retrieve user media:', err);
      return null;
    })
}

  deviceSelected() {
    this.setupCall(this.selectedDeviceId);
  }

  async drawTrackedPoint(point: { x: number, y: number }) {
    const canvas = document.getElementById('canvas') as HTMLCanvasElement;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height); // clear the canvas
      const pose = await this.estimatePose();
      if (pose) {
        this.drawKeypoints(pose.keypoints); // Redraw the keypoints
        const leftShoulder = pose.keypoints.find(kp => kp.name == 'left_shoulder');
        const rightShoulder = pose.keypoints.find(kp => kp.name == 'right_shoulder');
        if (leftShoulder && rightShoulder) {
          const chestX = (leftShoulder.x + rightShoulder.x) / 2;
          const chestY = (leftShoulder.y + rightShoulder.y) / 2;
          const chestWidth = Math.sqrt(Math.pow(rightShoulder.x - leftShoulder.x, 2) + Math.pow(rightShoulder.y - leftShoulder.y, 2));
          this.drawBoundingBox(chestX, chestY, chestWidth, chestWidth); // Redraw the bounding box
        }
      }
      ctx.beginPath();
      ctx.arc(point.x, point.y, 10, 0, 2 * Math.PI); // Draw a circle at the received point
      ctx.fillStyle = 'red';
      ctx.fill();
    }
}

/*drawSkeleton(keypoints: poseDetection.Keypoint[]) {
  const canvas = document.getElementById('canvas') as HTMLCanvasElement;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.beginPath();
    // Lines for the torso
    this.drawLineBetweenKeypoints(ctx, keypoints, 'left_shoulder', 'right_shoulder');
    this.drawLineBetweenKeypoints(ctx, keypoints, 'left_shoulder', 'left_hip');
    this.drawLineBetweenKeypoints(ctx, keypoints, 'right_shoulder', 'right_hip');
    this.drawLineBetweenKeypoints(ctx, keypoints, 'left_hip', 'right_hip');
    // Lines for the left arm
    this.drawLineBetweenKeypoints(ctx, keypoints, 'left_shoulder', 'left_elbow');
    this.drawLineBetweenKeypoints(ctx, keypoints, 'left_elbow', 'left_wrist');
    // Lines for the right arm
    this.drawLineBetweenKeypoints(ctx, keypoints, 'right_shoulder', 'right_elbow');
    this.drawLineBetweenKeypoints(ctx, keypoints, 'right_elbow', 'right_wrist');
    // Lines for the left leg
    this.drawLineBetweenKeypoints(ctx, keypoints, 'left_hip', 'left_knee');
    this.drawLineBetweenKeypoints(ctx, keypoints, 'left_knee', 'left_ankle');
    // Lines for the right leg
    this.drawLineBetweenKeypoints(ctx, keypoints, 'right_hip', 'right_knee');
    this.drawLineBetweenKeypoints(ctx, keypoints, 'right_knee', 'right_ankle');
    ctx.stroke();
  }
}

drawLineBetweenKeypoints(ctx: CanvasRenderingContext2D, keypoints: poseDetection.Keypoint[], point1: string, point2: string) {
  const kp1 = keypoints.find(kp => kp.name == point1);
  const kp2 = keypoints.find(kp => kp.name == point2);
  if (kp1?.score && kp1.score > 0.5 && kp2?.score && kp2.score > 0.5) { // Only draw lines for keypoints that are visible
    ctx.moveTo(kp1.x, kp1.y);
    ctx.lineTo(kp2.x, kp2.y);
  }
}

drawFacialLines(keypoints: poseDetection.Keypoint[]) {
  const canvas = document.getElementById('canvas') as HTMLCanvasElement;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.beginPath();
    this.drawLineBetweenKeypoints(ctx, keypoints, 'nose', 'left_eye');
    this.drawLineBetweenKeypoints(ctx, keypoints, 'nose', 'right_eye');
    this.drawLineBetweenKeypoints(ctx, keypoints, 'left_eye', 'left_ear');
    this.drawLineBetweenKeypoints(ctx, keypoints, 'right_eye', 'right_ear');
    ctx.strokeStyle = 'purple';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}*/
}