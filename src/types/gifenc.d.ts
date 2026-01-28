/**
 * Type declarations for gifenc package
 * https://github.com/mattdesl/gifenc
 */

declare module 'gifenc' {
  /**
   * GIF Encoder instance
   */
  interface GIFEncoderInstance {
    /**
     * Write a frame to the GIF
     * @param data - Indexed pixel data (Uint8Array)
     * @param width - Frame width
     * @param height - Frame height
     * @param options - Frame options
     */
    writeFrame(
      data: Uint8Array,
      width: number,
      height: number,
      options?: {
        palette?: number[][];
        delay?: number;
        dispose?: number;
        transparent?: boolean;
        transparentIndex?: number;
      }
    ): void;

    /**
     * Finish encoding and get the bytes
     */
    finish(): void;

    /**
     * Get the encoded GIF bytes
     */
    bytes(): Uint8Array;
  }

  /**
   * Create a new GIF encoder
   */
  export function GIFEncoder(): GIFEncoderInstance;

  /**
   * Quantize RGB data to a 256-color palette
   * @param rgbData - RGB data as Uint8Array (r, g, b, r, g, b, ...)
   * @param maxColors - Maximum colors in palette (default: 256)
   * @param options - Quantization options
   * @returns Array of RGB triplets representing the palette
   */
  export function quantize(
    rgbData: Uint8Array,
    maxColors?: number,
    options?: { format?: 'rgb565' | 'rgba4444' }
  ): number[][];

  /**
   * Apply a palette to RGB data to get indexed pixels
   * @param rgbData - RGB data as Uint8Array
   * @param palette - Palette from quantize()
   * @returns Indexed pixel data
   */
  export function applyPalette(rgbData: Uint8Array, palette: number[][]): Uint8Array;

  /**
   * Nearest color distance calculation
   */
  export function nearestColorIndex(palette: number[][], rgb: number[]): number;

  /**
   * Nearest color with dithering
   */
  export function nearestColorIndexWithDistance(
    palette: number[][],
    rgb: number[]
  ): [number, number];

  /**
   * Create a palette from pixels
   */
  export function prequantize(
    rgbData: Uint8Array,
    options?: { format?: 'rgb565' | 'rgba4444' }
  ): Uint8Array;
}
