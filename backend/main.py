
import os

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

load_dotenv()

app = FastAPI(
    title="PayPilot API",
    description="AI-powered autonomous commerce",
    version="0.1.0",
)

frontend_origin = os.getenv(
    "FRONTEND_ORIGIN",
    "http://localhost:3000",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[frontend_origin],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)


@app.get("/")
def root():
    return {
        "name": "PayPilot API",
        "message": "AI proposes. Policy protects. PayPal executes.",
    }


@app.get("/api/health")
def health():
    return {
        "status": "ok",
        "service": "paypilot-backend",
        "version": "0.1.0",
    }
