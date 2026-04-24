import os
import openeo
from fastapi import APIRouter, HTTPException
from dotenv import load_dotenv

load_dotenv()

router = APIRouter()

OPENEO_URL = os.getenv("OPENEO_URL", "https://openeo.dataspace.copernicus.eu")
CLIENT_ID = os.getenv("CDSE_CLIENT_ID")
CLIENT_SECRET = os.getenv("CDSE_CLIENT_SECRET")


def get_connection() -> openeo.Connection:
    """Returns an authenticated openEO connection using client credentials."""
    try:
        conn = openeo.connect(OPENEO_URL)
        conn.authenticate_oidc_client_credentials(
            client_id=CLIENT_ID,
            client_secret=CLIENT_SECRET,
        )
        return conn
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to connect to CDSE: {str(e)}")


@router.get("/status")
def auth_status():
    """Verify credentials are valid and connection works."""
    conn = get_connection()
    info = conn.describe_account()
    return {"authenticated": True, "account": info}
