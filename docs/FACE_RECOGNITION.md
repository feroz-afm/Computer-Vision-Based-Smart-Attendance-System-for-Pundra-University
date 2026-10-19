# PUB-AttendEye — Computer Vision & Face Recognition Architecture

**Project:** PUB AttendEye  
**Institution:** Pundra University of Science & Technology, Bogra  
**Hackathon:** PUB CSE Fest-26  

---

## 1. Selected Vision Models & Processing Pipeline

The biometric face recognition subsystem is architected in a modular 5-stage pipeline:

```text
[1. Optical Capture] 
       │  (Webcam / Classroom Photo Upload via HTML5 Video & Canvas)
       ▼
[2. Face Detection & Landmark Alignment]
       │  (Multi-face bounding box extraction & eye/nose landmark alignment)
       ▼
[3. Anti-Spoofing & Liveness Verification]
       │  (Micro-movement, texture analysis, voluntary blink/nod prompt)
       ▼
[4. Feature Embedding Extraction]
       │  (Normalized 128D / 512D biometric vector via FaceNet / ArcFace)
       ▼
[5. Roster-Scoped Cosine Matching & Decision Routing]
       │
       ├─► Sim >= 0.85 ──────────► [Status: Verified Present] (Auto-recorded)
       ├─► 0.65 <= Sim < 0.85 ───► [Status: Review Queue] (Teacher Review)
       └─► Sim < 0.65 ───────────► [Status: Unrecognized Face]
```

### Primary Model Specifications:
- **Detection Model:** MTCNN (Multi-task Cascaded Convolutional Networks) or RetinaFace.
- **Embedding Model:** Inception-ResNet FaceNet (128D embeddings) or MobileFaceNet (for real-time classroom edge inference).
- **Metric Space:** Cosine Similarity / Euclidean Distance on unit-normalized hyperspheres.
- **Licensing:** Open-source (Apache 2.0 / MIT compatible).

---

## 2. Ethical Safeguards, Privacy & Biometric Consent

In compliance with data protection principles and academic ethics:
1. **Explicit Consent (Mandatory):**
   Students must execute an informed consent record in [`student_consent`](file:///F:/Hackathon/PUB-AttendEye/supabase/schema.sql#L125) before biometric registration.
2. **Vectors Over Raw Photographs:**
   The database stores 128-dimensional floating-point mathematical embeddings (`face_enrollments`), never storing raw, unencrypted biometric face images.
3. **Restricted Search Space (Roster Scoping):**
   Faces are **only** matched against students who are legitimately enrolled in the specific course and section scheduled for that lecture session.

---

## 3. Review Queue & Anti-Proxy Liveness

- **Anti-Spoofing:** Protects against static printed photograph presentations or screen playback via landmark texture variances and prompt verification.
- **Human-in-the-Loop:** Matches in the uncertain confidence band (0.65 – 0.84) are never silently rejected or accepted; they are displayed in the Teacher's **Review Queue** for verification.
