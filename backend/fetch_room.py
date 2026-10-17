import json
import os

import certifi
import jwt
from dotenv import load_dotenv
from pymongo import MongoClient

if os.getenv("AWS_LAMBDA_FUNCTION_NAME") is None:
    load_dotenv()

MONGO_URI = os.getenv("MONGO_URI_KARTHIK")
MONGO_DB = os.getenv("MONGO_DB_KARTHIK", "test")
JWT_SECRET = os.getenv("JWT_SECRET", "super-secret-key")

HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token",
    "Access-Control-Allow-Methods": "DELETE,GET,HEAD,OPTIONS,PATCH,POST,PUT",
    "Content-Type": "application/json",
}


def get_db():
    if not MONGO_URI:
        raise ValueError("MONGO_URI_KARTHIK is missing")

    client = MongoClient(
        MONGO_URI,
        tlsCAFile=certifi.where(),
        serverSelectionTimeoutMS=10000,
    )
    client.admin.command("ping")
    return client[MONGO_DB]


def validate_jwt(auth_header):
    if not auth_header:
        raise ValueError("Authorization header is missing")

    parts = auth_header.split(" ")
    if len(parts) != 2 or parts[0].lower() != "bearer":
        raise ValueError("Authorization header must be in format: Bearer <token>")

    token = parts[1]
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
        return payload
    except Exception as e:
        raise ValueError(f"Invalid token: {str(e)}")


def build_stay_summary(stay, for_checkout=False):
    if not stay:
        return None

    summary = {
        "id": stay.get("id"),
        "guest_name": stay.get("guest_name"),
        "phone": stay.get("phone"),
        "adults": stay.get("adults"),
        "children": stay.get("children"),
        "check_in": stay.get("check_in"),
        "check_out": stay.get("check_out"),
        "payment_mode": stay.get("payment_mode"),
        "source": stay.get("source"),
    }

    if for_checkout:
        summary.update({
            "address": stay.get("address"),
            "room_rate": stay.get("room_rate"),
            "discount": stay.get("discount", 0),
            "extras": stay.get("extras") or [],
            "id_front_url": stay.get("id_front_url"),
            "id_back_url": stay.get("id_back_url"),
            "status": stay.get("status"),
            "created_at": stay.get("created_at"),
        })

    return summary


def resolve_filter(params):
    """
    Supports:
      ?type=checkin   -> vacant rooms (ready for check-in)
      ?type=checkout  -> occupied rooms (ready for check-out)
      ?type=all       -> all rooms
      ?status=vacant|occupied|all  (legacy alias)
    """
    type_param = (params.get("type") or "").strip().lower()
    status_param = (params.get("status") or "").strip().lower()

    if type_param:
        mapping = {
            "checkin": "vacant",
            "checkout": "occupied",
            "all": "all",
        }
        if type_param not in mapping:
            return None, "type must be one of: checkin, checkout, all"
        return mapping[type_param], None

    if status_param:
        if status_param not in {"all", "vacant", "occupied"}:
            return None, "status must be one of: all, vacant, occupied"
        return status_param, None

    return "all", None


def lambda_handler(event, context):
    try:
        if not event:
            return {
                "statusCode": 400,
                "headers": HEADERS,
                "body": json.dumps({"error": "No event body provided"}),
            }

        if event.get("httpMethod") == "OPTIONS":
            return {
                "statusCode": 200,
                "headers": HEADERS,
                "body": "",
            }

        headers = event.get("headers") or {}
        auth_header = headers.get("Authorization") or headers.get("authorization")

        try:
            decoded_token = validate_jwt(auth_header)
            print("[DEBUG] Valid JWT for user:", decoded_token.get("user_id"))
        except ValueError as e:
            return {
                "statusCode": 401,
                "headers": HEADERS,
                "body": json.dumps({"error": str(e)}),
            }

        params = event.get("queryStringParameters") or {}
        status_filter, filter_error = resolve_filter(params)
        if filter_error:
            return {
                "statusCode": 400,
                "headers": HEADERS,
                "body": json.dumps({"error": filter_error}),
            }

        for_checkout = (params.get("type") or "").strip().lower() == "checkout"

        db = get_db()

        rooms = list(
            db["rooms"].find(
                {"active": True},
                {"_id": 0, "uuid": 1, "room_num": 1, "active": 1, "metadata": 1},
            ).sort("room_num", 1)
        )

        stay_projection = {
            "_id": 0,
            "id": 1,
            "room_id": 1,
            "guest_name": 1,
            "phone": 1,
            "adults": 1,
            "children": 1,
            "check_in": 1,
            "check_out": 1,
            "payment_mode": 1,
            "source": 1,
        }

        if for_checkout:
            stay_projection.update({
                "address": 1,
                "room_rate": 1,
                "discount": 1,
                "extras": 1,
                "id_front_url": 1,
                "id_back_url": 1,
                "status": 1,
                "created_at": 1,
            })

        open_stays = list(
            db["stays"].find(
                {"status": "in"},
                stay_projection,
            )
        )

        # stays.room_id stores rooms.uuid
        stay_by_room_uuid = {}
        for stay in open_stays:
            room_key = stay.get("room_id")
            if room_key and room_key not in stay_by_room_uuid:
                stay_by_room_uuid[room_key] = stay

        items = []
        for room in rooms:
            room_uuid = room.get("uuid")
            stay = stay_by_room_uuid.get(room_uuid)
            occupancy = "occupied" if stay else "vacant"

            if status_filter != "all" and occupancy != status_filter:
                continue

            items.append({
                "uuid": room_uuid,
                "room_num": room.get("room_num"),
                "active": room.get("active", True),
                "status": occupancy,
                "metadata": room.get("metadata") or {},
                "stay": build_stay_summary(stay, for_checkout=for_checkout),
            })

        request_type = (params.get("type") or "all").strip().lower() or "all"

        return {
            "statusCode": 200,
            "headers": HEADERS,
            "body": json.dumps({
                "collection": "rooms",
                "type": request_type if request_type in {"checkin", "checkout", "all"} else "all",
                "items": items,
            }, default=str),
        }

    except Exception as e:
        print("[ERROR] Failed to fetch rooms:", repr(e))
        import traceback
        traceback.print_exc()
        return {
            "statusCode": 500,
            "headers": HEADERS,
            "body": json.dumps({"error": "Internal server error", "details": str(e)}),
        }
