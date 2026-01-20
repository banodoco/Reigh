"""
ComfyUI Agent Tools (Native/hiddenswitch version)

Uses the pip-installable ComfyUI fork from DoctorPangloss/hiddenswitch.
This imports ComfyUI internals directly - no HTTP API, no JSON workflows.

Install:
    pip install "comfyui[withtorch]@git+https://github.com/hiddenswitch/ComfyUI.git"

Usage:
    from comfy_agent_native import ComfyAgentNative

    agent = ComfyAgentNative()
    agent.init()
    agent.load_model("sdxl", "sd_xl_base_1.0.safetensors")
    agent.generate("a cat in space", model="sdxl")
"""

import os
import sys
from typing import Optional, Any
from pathlib import Path


class ComfyAgentNative:
    """
    Agent interface using native ComfyUI imports (hiddenswitch fork).

    This bypasses the HTTP API entirely - direct Python access to nodes.
    """

    def __init__(self):
        self._initialized = False
        self._models: dict[str, dict[str, Any]] = {}
        self._nodes: dict[str, Any] = {}

    def init(self, models_dir: Optional[str] = None) -> str:
        """
        Initialize ComfyUI internals.

        Args:
            models_dir: Path to models directory (checkpoints, loras, etc.)

        Returns:
            Status message.
        """
        if self._initialized:
            return "Already initialized"

        try:
            # The hiddenswitch fork makes these importable
            import comfy.sd
            import comfy.utils
            import comfy.model_management
            import comfy.samplers

            # Import node implementations
            # These are the actual node classes from ComfyUI
            from nodes import (
                CheckpointLoaderSimple,
                CLIPTextEncode,
                EmptyLatentImage,
                KSampler,
                VAEDecode,
                SaveImage,
                NODE_CLASS_MAPPINGS,
            )

            # Store references
            self._nodes = {
                "CheckpointLoaderSimple": CheckpointLoaderSimple(),
                "CLIPTextEncode": CLIPTextEncode(),
                "EmptyLatentImage": EmptyLatentImage(),
                "KSampler": KSampler(),
                "VAEDecode": VAEDecode(),
                "SaveImage": SaveImage(),
            }

            # Store all available nodes for execute()
            self._all_nodes = NODE_CLASS_MAPPINGS

            # Store comfy modules for advanced usage
            self._comfy = {
                "sd": comfy.sd,
                "utils": comfy.utils,
                "model_management": comfy.model_management,
                "samplers": comfy.samplers,
            }

            self._initialized = True
            return "ComfyUI native runtime initialized"

        except ImportError as e:
            return (
                f"Failed to import ComfyUI: {e}\n"
                "Install with: pip install 'comfyui[withtorch]@git+https://github.com/hiddenswitch/ComfyUI.git'"
            )
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
            name: Friendly name to reference this model
            checkpoint_path: Path or filename of the checkpoint

        Returns:
            Status message.
        """
        if not self._initialized:
            return "Error: Call init() first"

        if name in self._models:
            return f"Model '{name}' already loaded"

        try:
            # Call the node's function directly
            loader = self._nodes["CheckpointLoaderSimple"]

            # CheckpointLoaderSimple.load_checkpoint returns (model, clip, vae)
            result = loader.load_checkpoint(checkpoint_path)
            model, clip, vae = result[0], result[1], result[2]

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
        """
        if not self._initialized:
            return "Error: Call init() first"

        if model not in self._models:
            available = list(self._models.keys())
            return f"Error: Model '{model}' not loaded. Available: {available}"

        try:
            import random
            import torch

            m = self._models[model]

            if seed is None:
                seed = random.randint(0, 2**32 - 1)

            # Get node instances
            clip_encode = self._nodes["CLIPTextEncode"]
            empty_latent = self._nodes["EmptyLatentImage"]
            ksampler = self._nodes["KSampler"]
            vae_decode = self._nodes["VAEDecode"]
            save_image = self._nodes["SaveImage"]

            # Encode prompts - returns tuple, first element is the conditioning
            positive = clip_encode.encode(m["clip"], prompt)[0]
            negative = clip_encode.encode(m["clip"], negative_prompt)[0]

            # Create empty latent - returns tuple with latent dict
            latent = empty_latent.generate(width, height, 1)[0]

            # Sample - KSampler.sample returns tuple with latent
            sampled = ksampler.sample(
                m["model"],
                seed,
                steps,
                cfg,
                sampler,
                scheduler,
                positive,
                negative,
                latent,
            )[0]

            # Decode - returns tuple with image tensor
            image = vae_decode.decode(m["vae"], sampled)[0]

            # Save
            prefix = output_path or "comfy_output"
            result = save_image.save_images(image, prefix)

            return f"Generated image with seed {seed}"

        except Exception as e:
            import traceback
            return f"Generation failed: {e}\n{traceback.format_exc()}"

    def execute(self, code: str) -> Any:
        """
        Execute arbitrary Python code with access to warm models and nodes.

        The code has access to:
        - `models`: Dict of loaded models with 'model', 'clip', 'vae' keys
        - `nodes`: Dict of instantiated node objects
        - `all_nodes`: NODE_CLASS_MAPPINGS for creating any node
        - `comfy`: Dict of comfy modules (sd, utils, model_management, samplers)

        Args:
            code: Python code to execute

        Returns:
            The result of the last expression, or error message.

        Example:
            agent.execute('''
                m = models["sdxl"]

                # Direct node calls
                clip_encode = nodes["CLIPTextEncode"]
                pos = clip_encode.encode(m["clip"], "a dog")[0]
                neg = clip_encode.encode(m["clip"], "bad")[0]

                latent = nodes["EmptyLatentImage"].generate(512, 512, 1)[0]

                sampled = nodes["KSampler"].sample(
                    m["model"], 123, 20, 7.0, "euler", "normal",
                    pos, neg, latent
                )[0]

                image = nodes["VAEDecode"].decode(m["vae"], sampled)[0]
                nodes["SaveImage"].save_images(image, "dog_output")
            ''')
        """
        if not self._initialized:
            return "Error: Call init() first"

        try:
            # Build execution context with full access
            exec_globals = {
                "models": self._models,
                "nodes": self._nodes,
                "all_nodes": self._all_nodes,
                "comfy": self._comfy,
            }
            exec_locals: dict[str, Any] = {}

            exec(code, exec_globals, exec_locals)

            if exec_locals:
                return list(exec_locals.values())[-1]
            return "Executed successfully"

        except Exception as e:
            import traceback
            return f"Execution failed: {e}\n{traceback.format_exc()}"

    def get_node(self, node_name: str) -> Any:
        """
        Get or create a node instance by name.

        Useful for accessing nodes not in the default set.
        """
        if not self._initialized:
            return None

        if node_name in self._nodes:
            return self._nodes[node_name]

        if node_name in self._all_nodes:
            self._nodes[node_name] = self._all_nodes[node_name]()
            return self._nodes[node_name]

        return None

    def unload_model(self, name: str) -> str:
        """Unload a model from memory."""
        if name in self._models:
            del self._models[name]
            # Trigger garbage collection to free VRAM
            import gc
            import torch
            gc.collect()
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
            return f"Unloaded model '{name}'"
        return f"Model '{name}' not found"

    def shutdown(self) -> str:
        """Shutdown and free all resources."""
        self._models.clear()
        self._nodes.clear()
        self._initialized = False

        import gc
        import torch
        gc.collect()
        if torch.cuda.is_available():
            torch.cuda.empty_cache()

        return "Shutdown complete"
