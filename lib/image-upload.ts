export const MAX_IMAGE_UPLOAD_BYTES = 1024 * 1024;
const DEFAULT_MAX_DIMENSION = 1600;
const MIN_DIMENSION = 960;
const QUALITY_STEPS = [0.82, 0.72, 0.64, 0.56, 0.48, 0.4];

type ProcessedImage = {
  bytes: number;
  dataUrl: string;
  height: number;
  width: number;
};

function readFileAsDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }

      reject(new Error("No se ha podido leer la imagen."));
    };

    reader.onerror = () => reject(new Error("No se ha podido leer la imagen."));
    reader.readAsDataURL(blob);
  });
}

function loadImage(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("El archivo no es una imagen válida."));
    };

    image.src = objectUrl;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
          return;
        }

        reject(new Error("No se ha podido procesar la imagen."));
      },
      type,
      quality,
    );
  });
}

export async function processImageForUpload(file: File): Promise<ProcessedImage> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Solo se permiten archivos de imagen.");
  }

  const image = await loadImage(file);
  let maxDimension = DEFAULT_MAX_DIMENSION;

  while (maxDimension >= MIN_DIMENSION) {
    const scale = Math.min(1, maxDimension / Math.max(image.width, image.height));
    const width = Math.max(1, Math.round(image.width * scale));
    const height = Math.max(1, Math.round(image.height * scale));
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");

    if (!context) {
      throw new Error("No se ha podido preparar la imagen.");
    }

    canvas.width = width;
    canvas.height = height;
    context.drawImage(image, 0, 0, width, height);

    for (const quality of QUALITY_STEPS) {
      const blob = await canvasToBlob(canvas, "image/webp", quality);

      if (blob.size <= MAX_IMAGE_UPLOAD_BYTES) {
        return {
          bytes: blob.size,
          dataUrl: await readFileAsDataUrl(blob),
          height,
          width,
        };
      }
    }

    maxDimension -= 160;
  }

  throw new Error(
    "La imagen sigue siendo demasiado pesada. Usa una imagen de menos de 1024 KB o con menos resolución.",
  );
}
