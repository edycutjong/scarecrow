import { runCompletion, loadLLMModel, unloadQVACModel, MULTIMODAL_MODEL_ID } from "./qvac.js";
import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import path from "path";

const execAsync = promisify(exec);

// Mock rotation state
let mockFrameIndex = 0;
const MOCK_FRAMES = [
  "docs/screenshots/stimulus-person.jpg", // Triggers 'person' alert
  "docs/screenshots/stimulus-dog.jpg",    // Triggers 'ignore' rule
  "docs/screenshots/stimulus-van.jpg",    // Triggers 'unknown vehicle' alert
  "docs/screenshots/stimulus-truck.jpg"   // Triggers 'known entity' RAG suppression
];

// Captures frame from Raspberry Pi camera
export async function captureFrame(): Promise<Buffer | null> {
  if (process.env.MOCK_HARDWARE === "true") {
    const framePath = MOCK_FRAMES[mockFrameIndex % MOCK_FRAMES.length];
    console.log(`[vision] MOCK_HARDWARE=true — cycling dummy frame: ${framePath}`);
    mockFrameIndex++;
    
    // Simulate a bit of camera/processing latency so the UI doesn't freak out or blur past
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Return the actual file buffer so @qvac/sdk doesn't crash!
    return await fs.readFile(path.join(process.cwd(), framePath));
  }

  const tmpPath = path.join(process.cwd(), "temp_frame.jpg");
  try {
    console.log("[vision] Capturing frame using libcamera-still...");
    await execAsync(`libcamera-still -t 500 -o ${tmpPath} -n --width 640 --height 480`);
    const buffer = await fs.readFile(tmpPath);
    await fs.unlink(tmpPath); // Cleanup
    console.log("[vision] Frame captured successfully.");
    return buffer;
  } catch (err: any) {
    console.error("[vision] Failed to capture frame with libcamera-still:", err.message);
    return null;
  }
}

export async function analyzeScene(imageBuffer: Buffer): Promise<string> {
  const modelId = await loadLLMModel(MULTIMODAL_MODEL_ID);
  
  const response = await runCompletion({
    modelId,
    history: [{ 
      role: "user", 
      content: "Describe exactly what you see in this image. Is there a person, animal, or vehicle?" 
    }],
    stream: false,
    images: [imageBuffer]
  });

  await unloadQVACModel(modelId); // Free RAM immediately
  return response.text;
}
