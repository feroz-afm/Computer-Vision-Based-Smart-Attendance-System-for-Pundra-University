/**
 * Modular Face Recognition & Vision Engine Types
 * PUB CSE Fest-26 Hackathon Core Biometric Contracts
 */

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LandmarkPoint {
  x: number;
  y: number;
}

export interface DetectedFace {
  faceId: string;
  box: BoundingBox;
  confidence: number;
  landmarks?: LandmarkPoint[];
  livenessPassed: boolean;
  livenessScore?: number;
}

export interface BiometricSample {
  studentId: string;
  sampleIndex: number;
  embedding: number[]; // 128-dimensional or 512-dimensional vector
  capturedAt: string;
}

export interface ConfidenceThresholds {
  autoVerifyThreshold: number; // e.g. 0.85 -> marked 'present' automatically
  reviewQueueThreshold: number; // e.g. 0.65 -> routed to teacher review queue
}

export interface MatchDecision {
  matchFound: boolean;
  studentId: string | null;
  studentName?: string;
  similarityScore: number;
  status: 'verified_present' | 'needs_review' | 'unrecognized';
  livenessVerified: boolean;
  rejectionReason?: string;
}

export interface IFaceRecognitionPipeline {
  detectFacesInFrame(videoElement: HTMLVideoElement | HTMLCanvasElement): Promise<DetectedFace[]>;
  verifyLiveness(face: DetectedFace, promptAction?: 'blink' | 'nod' | 'smile'): Promise<boolean>;
  computeFaceEmbedding(faceCrop: ImageData | Blob): Promise<number[]>;
  matchAgainstRoster(
    embedding: number[],
    authorizedStudentEmbeddings: { studentId: string; name: string; embedding: number[] }[],
    thresholds?: ConfidenceThresholds
  ): MatchDecision;
}
