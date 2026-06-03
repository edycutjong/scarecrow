import { runCompletion, loadLLMModel, unloadQVACModel, MULTIMODAL_MODEL_ID } from "./qvac.js";

// Simulates PIR wake trigger or captures frame from camera
export async function captureFrame(): Promise<Buffer | null> {
  // In a real device, this would read from the Pi Camera
  console.log("[vision] Captured frame from camera.");
  return Buffer.from("simulated_image_data");
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
