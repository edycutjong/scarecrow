import { runCompletion, loadLLMModel, unloadQVACModel, MULTIMODAL_MODEL_ID } from "./qvac.js";
import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import path from "path";

const execAsync = promisify(exec);

// Captures frame from Raspberry Pi camera
export async function captureFrame(): Promise<Buffer | null> {
  if (process.env.MOCK_HARDWARE === "true") {
    console.log("[vision] MOCK_HARDWARE=true — returning dummy frame to bypass hardware");
    return await fs.readFile(path.join(process.cwd(), "docs", "screenshots", "stimulus-person.jpg"));
  }
  const tmpPath = path.join(process.cwd(), "temp_frame.jpg");
  try {
    console.log("[vision] Capturing frame using libcamera-still...");
    // Grab a frame, wait 500ms for auto-exposure, output to tmpPath, no preview
    await execAsync(`libcamera-still -t 500 -o ${tmpPath} -n --width 640 --height 480`);
    const buffer = await fs.readFile(tmpPath);
    await fs.unlink(tmpPath); // Cleanup
    console.log("[vision] Frame captured successfully.");
    return buffer;
  } catch (err: any) {
    console.error("[vision] Failed to capture frame with libcamera-still:", err.message);
    // Return null so the sentry loop knows it failed
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
