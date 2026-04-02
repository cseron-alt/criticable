import { ImageResponse } from "next/og";

export const size = {
  height: 180,
  width: 180,
};

export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          alignItems: "center",
          background: "#f4d000",
          color: "#111111",
          display: "flex",
          fontSize: 92,
          fontStyle: "normal",
          fontWeight: 900,
          height: "100%",
          justifyContent: "center",
          width: "100%",
        }}
      >
        c.
      </div>
    ),
    size,
  );
}
