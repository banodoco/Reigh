"""
ComfyUI Agent Tools

Keep ComfyUI warm and execute code against loaded models.

Two implementations:
- ComfyAgent: Uses ComfyScript (pip install comfy-script)
- ComfyAgentNative: Uses hiddenswitch fork (pip install comfyui from git)
"""

from .comfy_agent import (
    ComfyAgent,
    get_agent,
    init,
    load_model,
    generate,
    execute,
)

from .comfy_agent_native import ComfyAgentNative

__all__ = [
    # ComfyScript version
    "ComfyAgent",
    "get_agent",
    "init",
    "load_model",
    "generate",
    "execute",
    # Native/hiddenswitch version
    "ComfyAgentNative",
]
