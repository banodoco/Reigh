"""
ComfyUI Agent Tools

Simple tools for keeping ComfyUI warm and executing code against loaded models.
Uses ComfyScript for direct Python access to ComfyUI nodes.

Usage:
    from comfy_agent import ComfyAgent

    agent = ComfyAgent()
    agent.init()
    agent.load_model("sdxl", "sd_xl_base_1.0.safetensors")
    agent.generate("a cat in space", model="sdxl", output_path="cat.png")

    # Or execute arbitrary code
    agent.execute('''
        pos = CLIPTextEncode("custom prompt", models["sdxl"]["clip"])
        # ... custom workflow
    ''')
"""

import os
from typing import Optional, Any
from pathlib import Path


class ComfyAgent:
    """Agent interface for ComfyUI with warm model support."""

    def __init__(self):
        self._initialized = False
        self._models: dict[str, dict[str, Any]] = {}
        self._runtime_globals: dict[str, Any] = {}

    def init(self, comfy_path: Optional[str] = None) -> str:
        """
        Initialize the ComfyUI/ComfyScript runtime.

        Args:
            comfy_path: Optional path to ComfyUI installation.
                       If not provided, assumes ComfyScript can find it.

        Returns:
            Status message.
        """
        if self._initialized:
            return "Already initialized"

        try:
            # Import and initialize ComfyScript runtime
            from comfy_script.runtime import load
            from comfy_script.runtime.nodes import *

            # Load the runtime (connects to or starts ComfyUI)
            load()

            # Store node functions in runtime globals for execute()
            self._runtime_globals = {
                'CheckpointLoaderSimple': CheckpointLoaderSimple,
                'CLIPTextEncode': CLIPTextEncode,
                'EmptyLatentImage': EmptyLatentImage,
                'KSampler': KSampler,
                'VAEDecode': VAEDecode,
                'SaveImage': SaveImage,
                # Add more nodes as needed
            }

            self._initialized = True
            return "ComfyUI runtime initialized"

        except ImportError as e:
            return f"Failed to import ComfyScript: {e}. Install with: pip install comfy-script"
        except Exception as e:
            return f"Failed to initialize: {e}"

    def load_model(
        self,
        name: str,
        checkpoint_path: str,
    ) -> str:
        """
        Load a checkpoint model and keep it warm in memory.

        Args:
            name: Friendly name to reference this model (e.g., "sdxl", "flux")
            checkpoint_path: Path to the .safetensors checkpoint file

        Returns:
            Status message.
        """
        if not self._initialized:
            return "Error: Call init() first"

        if name in self._models:
            return f"Model '{name}' already loaded"

        try:
            from comfy_script.runtime.nodes import CheckpointLoaderSimple

            # Load the checkpoint - returns (model, clip, vae)
            model, clip, vae = CheckpointLoaderSimple(checkpoint_path)

            self._models[name] = {
                "model": model,
                "clip": clip,
                "vae": vae,
                "path": checkpoint_path,
            }

            return f"Loaded model '{name}' from {checkpoint_path}"

        except Exception as e:
            return f"Failed to load model: {e}"

    def list_models(self) -> dict[str, str]:
        """List all loaded models and their paths."""
        return {name: info["path"] for name, info in self._models.items()}

    def generate(
        self,
        prompt: str,
        model: str = "default",
        negative_prompt: str = "bad quality, blurry, distorted",
        width: int = 1024,
        height: int = 1024,
        steps: int = 20,
        cfg: float = 7.0,
        seed: Optional[int] = None,
        sampler: str = "euler",
        scheduler: str = "normal",
        output_path: Optional[str] = None,
    ) -> str:
        """
        Generate an image using txt2img with a warm model.

        Args:
            prompt: The positive prompt
            model: Name of the loaded model to use
            negative_prompt: The negative prompt
            width: Image width
            height: Image height
            steps: Number of sampling steps
            cfg: Classifier-free guidance scale
            seed: Random seed (None for random)
            sampler: Sampler name (euler, dpm_2, etc.)
            scheduler: Scheduler name (normal, karras, etc.)
            output_path: Where to save the image (None for auto)

        Returns:
            Path to the generated image or error message.
        """
        if not self._initialized:
            return "Error: Call init() first"

        if model not in self._models:
            available = list(self._models.keys())
            return f"Error: Model '{model}' not loaded. Available: {available}"

        try:
            from comfy_script.runtime.nodes import (
                CLIPTextEncode,
                EmptyLatentImage,
                KSampler,
                VAEDecode,
                SaveImage,
            )
            import random

            m = self._models[model]

            # Use random seed if not specified
            if seed is None:
                seed = random.randint(0, 2**32 - 1)

            # Encode prompts
            positive = CLIPTextEncode(prompt, m["clip"])
            negative = CLIPTextEncode(negative_prompt, m["clip"])

            # Create empty latent
            latent = EmptyLatentImage(width, height, 1)

            # Sample
            result = KSampler(
                m["model"],
                seed,
                steps,
                cfg,
                sampler,
                scheduler,
                positive,
                negative,
                latent,
            )

            # Decode
            image = VAEDecode(result, m["vae"])

            # Save
            if output_path:
                prefix = str(Path(output_path).stem)
                output_dir = str(Path(output_path).parent)
            else:
                prefix = "comfy_output"
                output_dir = "output"

            saved = SaveImage(image, prefix)

            return f"Generated image with seed {seed}: {saved}"

        except Exception as e:
            return f"Generation failed: {e}"

    def execute(self, code: str) -> Any:
        """
        Execute arbitrary Python code with access to warm models.

        The code has access to:
        - `models`: Dict of loaded models, each with 'model', 'clip', 'vae' keys
        - All ComfyScript node functions (CheckpointLoaderSimple, KSampler, etc.)

        Args:
            code: Python code to execute

        Returns:
            The result of the last expression, or error message.

        Example:
            agent.execute('''
                m = models["sdxl"]
                pos = CLIPTextEncode("a dog", m["clip"])
                neg = CLIPTextEncode("bad", m["clip"])
                latent = EmptyLatentImage(512, 512, 1)
                result = KSampler(m["model"], 123, 20, 7.0, "euler", "normal", pos, neg, latent)
                image = VAEDecode(result, m["vae"])
                SaveImage(image, "dog_output")
            ''')
        """
        if not self._initialized:
            return "Error: Call init() first"

        try:
            # Build execution context
            exec_globals = {
                "models": self._models,
                **self._runtime_globals,
            }
            exec_locals: dict[str, Any] = {}

            # Execute the code
            exec(code, exec_globals, exec_locals)

            # Return the last assigned value if any
            if exec_locals:
                return list(exec_locals.values())[-1]
            return "Executed successfully"

        except Exception as e:
            return f"Execution failed: {e}"

    def unload_model(self, name: str) -> str:
        """Unload a model from memory."""
        if name in self._models:
            del self._models[name]
            return f"Unloaded model '{name}'"
        return f"Model '{name}' not found"

    def shutdown(self) -> str:
        """Shutdown the runtime and free all resources."""
        self._models.clear()
        self._runtime_globals.clear()
        self._initialized = False
        return "Shutdown complete"


# Convenience singleton for simple usage
_default_agent: Optional[ComfyAgent] = None

def get_agent() -> ComfyAgent:
    """Get or create the default ComfyAgent instance."""
    global _default_agent
    if _default_agent is None:
        _default_agent = ComfyAgent()
    return _default_agent


# Simple function interface
def init(comfy_path: Optional[str] = None) -> str:
    """Initialize the default ComfyAgent."""
    return get_agent().init(comfy_path)

def load_model(name: str, checkpoint_path: str) -> str:
    """Load a model into the default agent."""
    return get_agent().load_model(name, checkpoint_path)

def generate(prompt: str, **kwargs) -> str:
    """Generate an image using the default agent."""
    return get_agent().generate(prompt, **kwargs)

def execute(code: str) -> Any:
    """Execute code using the default agent."""
    return get_agent().execute(code)
