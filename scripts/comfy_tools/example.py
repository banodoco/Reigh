"""
Example usage of ComfyAgent tools.

Prerequisites:
    pip install comfy-script

Make sure ComfyUI is running, or ComfyScript can start it.
"""

from comfy_agent import ComfyAgent

def main():
    # Create agent
    agent = ComfyAgent()

    # 1. Initialize runtime (connects to ComfyUI)
    print(agent.init())

    # 2. Load a model (stays warm in memory)
    print(agent.load_model("sdxl", "sd_xl_base_1.0.safetensors"))

    # 3. Generate with simple API
    print(agent.generate(
        prompt="a cat astronaut floating in space, digital art",
        model="sdxl",
        steps=20,
        seed=42,
    ))

    # 4. Or execute arbitrary code against warm models
    result = agent.execute('''
# Access the warm model
m = models["sdxl"]

# Custom workflow - img2img, inpainting, whatever you want
pos = CLIPTextEncode("a dog wearing sunglasses, photorealistic", m["clip"])
neg = CLIPTextEncode("cartoon, drawing, bad quality", m["clip"])

latent = EmptyLatentImage(1024, 1024, 1)

# Can use any sampler settings
result = KSampler(
    m["model"],
    seed=12345,
    steps=25,
    cfg=8.0,
    sampler_name="dpmpp_2m",
    scheduler="karras",
    positive=pos,
    negative=neg,
    latent_image=latent,
)

image = VAEDecode(result, m["vae"])
output = SaveImage(image, "custom_dog")
output  # Return value
''')
    print(f"Custom execution result: {result}")

    # 5. Can load multiple models
    print(agent.load_model("flux", "flux1-dev.safetensors"))
    print(agent.list_models())

    # 6. Generate with different model
    print(agent.generate("a mountain landscape", model="flux"))

    # Cleanup
    print(agent.shutdown())


if __name__ == "__main__":
    main()
