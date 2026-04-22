import Head from "next/head";
import {
  ShieldCheck,
  Download,
  Monitor,
  CheckCircle,
  AlertTriangle,
} from "lucide-react";

export default function DownloadPage() {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#020617",
        color: "#f8fafc",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <Head>
        <title>Secure Launcher | CIE Portal</title>
      </Head>

      <nav
        style={{
          padding: "30px 60px",
          borderBottom: "1px solid #1e293b",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "15px" }}>
          <ShieldCheck color="#10b981" size={32} />
          <span
            style={{
              fontWeight: "bold",
              fontSize: "20px",
              letterSpacing: "-0.5px",
            }}
          >
            CIE SECURE GUARD
          </span>
        </div>
        <button
          onClick={() => (window.location.href = "/")}
          style={{
            background: "transparent",
            border: "1px solid #334155",
            color: "#94a3b8",
            padding: "10px 20px",
            borderRadius: "12px",
            cursor: "pointer",
          }}
        >
          Back to Login
        </button>
      </nav>

      <main
        style={{
          maxWidth: "1000px",
          margin: "80px auto",
          padding: "0 40px",
          textAlign: "center",
        }}
      >
        <div
          style={{
            display: "inline-flex",
            padding: "20px",
            background: "rgba(16, 185, 129, 0.1)",
            borderRadius: "30px",
            marginBottom: "30px",
          }}
        >
          <Monitor size={48} color="#10b981" />
        </div>

        <h1
          style={{
            fontSize: "48px",
            fontWeight: "900",
            marginBottom: "20px",
            letterSpacing: "-2px",
          }}
        >
          Download Secure Launcher
        </h1>
        <p
          style={{
            fontSize: "18px",
            color: "#94a3b8",
            maxWidth: "600px",
            margin: "0 auto 40px",
            lineHeight: "1.6",
          }}
        >
          To ensure 100% academic integrity, CIE evaluations must be taken
          through our **Native Secure Launcher**. This application blocks
          screenshots and unauthorized window switching.
        </p>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
            gap: "30px",
            marginBottom: "60px",
          }}
        >
          <div
            className="premium-card"
            style={{
              textAlign: "left",
              padding: "30px",
              background: "#0f172a",
              border: "1px solid #1e293b",
            }}
          >
            <h3
              style={{
                marginBottom: "20px",
                display: "flex",
                alignItems: "center",
                gap: "10px",
              }}
            >
              <CheckCircle size={20} color="#10b981" /> Security Features
            </h3>
            <ul
              style={{
                padding: 0,
                listStyle: "none",
                color: "#94a3b8",
                fontSize: "15px",
              }}
            >
              <li style={{ marginBottom: "12px" }}>
                • Hardware-level Screenshot Blocking
              </li>
              <li style={{ marginBottom: "12px" }}>
                • System Clipboard Lockdown
              </li>
              <li style={{ marginBottom: "12px" }}>
                • Forced Fullscreen (Kiosk Mode)
              </li>
              <li>• Multi-monitor Detection</li>
            </ul>
          </div>

          <div
            className="premium-card"
            style={{
              textAlign: "left",
              padding: "30px",
              background: "#0f172a",
              border: "1px solid #1e293b",
            }}
          >
            <h3
              style={{
                marginBottom: "20px",
                display: "flex",
                alignItems: "center",
                gap: "10px",
              }}
            >
              <AlertTriangle size={20} color="#f59e0b" /> Installation Note
            </h3>
            <p
              style={{ color: "#94a3b8", fontSize: "14px", lineHeight: "1.6" }}
            >
              If Windows Defender shows a warning (Unrecognized App), click{" "}
              <strong>"More Info"</strong> and then{" "}
              <strong>"Run Anyway"</strong>. The launcher requires
              administrative permissions to lock the environment.
            </p>
          </div>
        </div>

        <div
          style={{
            background: "#10b981",
            padding: "40px",
            borderRadius: "32px",
            display: "inline-flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "20px",
          }}
        >
          <div
            style={{ color: "#020617", fontWeight: "900", fontSize: "24px" }}
          >
            CIE_Secure_Launcher v1.0.8
          </div>
          <a
            href="/api/download"
            style={{
              textDecoration: "none",
              background: "#020617",
              color: "white",
              border: "none",
              padding: "20px 60px",
              borderRadius: "20px",
              fontSize: "18px",
              fontWeight: "bold",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "15px",
            }}
          >
            <Download size={24} /> DOWNLOAD FOR WINDOWS
          </a>
          <div
            style={{
              color: "rgba(0,0,0,0.5)",
              fontSize: "10px",
              fontWeight: "bold",
              textAlign: "center",
              maxWidth: "350px",
              wordBreak: "break-all"
            }}
          >
            SHA256: 40b863bad04fd94eebc5382f5f7412b7bbd4d70020330c8e21692b034bf21d14
            <br />
            VERSION 1.0.8 • WINDOWS 10/11 • ~80 MB
          </div>
        </div>
      </main>

      <footer
        style={{
          marginTop: "100px",
          padding: "40px",
          textAlign: "center",
          borderTop: "1px solid #1e293b",
          color: "#475569",
          fontSize: "13px",
        }}
      >
        Official Secure Environment developed for the CSE Department.
      </footer>
    </div>
  );
}
