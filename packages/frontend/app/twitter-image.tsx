import { ImageResponse } from "next/og";

export const runtime = "edge";

export const alt = "SuperPage - Commerce for Humans & AI";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#0f0e13",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Glow backgrounds */}
        <div
          style={{
            position: "absolute",
            top: 40,
            left: 100,
            width: 300,
            height: 300,
            borderRadius: "50%",
            background: "rgba(232, 160, 191, 0.12)",
            filter: "blur(80px)",
          }}
        />
        <div
          style={{
            position: "absolute",
            top: 80,
            right: 150,
            width: 250,
            height: 250,
            borderRadius: "50%",
            background: "rgba(91, 143, 185, 0.12)",
            filter: "blur(80px)",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: 40,
            left: "35%",
            width: 280,
            height: 280,
            borderRadius: "50%",
            background: "rgba(229, 186, 115, 0.10)",
            filter: "blur(80px)",
          }}
        />

        {/* Content */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 24,
            zIndex: 1,
          }}
        >
          {/* Badge */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "10px 24px",
              borderRadius: 999,
              backgroundColor: "rgba(124, 180, 216, 0.12)",
              border: "1px solid rgba(124, 180, 216, 0.25)",
              color: "#7CB4D8",
              fontSize: 18,
              fontWeight: 700,
            }}
          >
            x402 Protocol · Autonomous Payments
          </div>

          {/* Logo */}
          <img
            src="https://superpa.ge/logo.png"
            width={120}
            height={120}
            style={{ objectFit: "contain" }}
          />

          {/* Headline */}
          <div
            style={{
              display: "flex",
              fontSize: 72,
              fontWeight: 800,
              color: "#f0ece6",
              lineHeight: 1.1,
              textAlign: "center",
              letterSpacing: "-0.02em",
            }}
          >
            Commerce for Humans
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 72,
              fontWeight: 800,
              lineHeight: 1.1,
              textAlign: "center",
              letterSpacing: "-0.02em",
              background:
                "linear-gradient(135deg, #5B8FB9, #E8A0BF, #E5BA73)",
              backgroundClip: "text",
              color: "transparent",
            }}
          >
            & AI.
          </div>

          {/* Subtitle */}
          <div
            style={{
              fontSize: 24,
              color: "#9a95a6",
              textAlign: "center",
              maxWidth: 700,
              lineHeight: 1.5,
            }}
          >
            Paywall your APIs, files, articles, and stores. Instant USDC
            payments on Base.
          </div>

          {/* Trust badges */}
          <div
            style={{
              display: "flex",
              gap: 24,
              marginTop: 8,
            }}
          >
            {["Powered by Base", "USDC Payments", "AI-Native", "HTTP 402"].map(
              (badge) => (
                <div
                  key={badge}
                  style={{
                    padding: "8px 20px",
                    borderRadius: 999,
                    backgroundColor: "rgba(255,255,255,0.06)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    color: "#9a95a6",
                    fontSize: 14,
                    fontWeight: 600,
                  }}
                >
                  {badge}
                </div>
              )
            )}
          </div>
        </div>

        {/* Bottom bar */}
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: 4,
            background: "linear-gradient(90deg, #5B8FB9, #E8A0BF, #E5BA73)",
          }}
        />
      </div>
    ),
    { ...size }
  );
}
