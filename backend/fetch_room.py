"""
fern03 Lambda: room occupancy (GET) + check-in / check-out (POST).

Deploy this file as fern03 (replace the previous GET-only handler).
"""
import json
import os
import uuid
from datetime import datetime

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

VALID_PAYMENT_MODES = {"Cash", "UPI", "Card"}


def response(status_code, body):
    return {
        "statusCode": status_code,
        "headers": HEADERS,
        "body": json.dumps(body, default=str),
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
        return jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
    except Exception as e:
        raise ValueError(f"Invalid token: {str(e)}")


def parse_body(event):
    body = event.get("body") or {}
    if isinstance(body, str):
        body = json.loads(body) if body.strip() else {}
    if not isinstance(body, dict):
        raise ValueError("Request body must be a JSON object")
    return body


def get_type(params, body=None):
    type_param = (params.get("type") or "").strip().lower()
    if not type_param and body:
        type_param = str(body.get("type") or "").strip().lower()
    return type_param


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
            "actual_check_out": stay.get("actual_check_out"),
            "settled_total": stay.get("settled_total"),
        })

    return summary


def night_count(check_in, check_out):
    start = datetime.fromisoformat(str(check_in).replace("Z", "+00:00"))
    end = datetime.fromisoformat(str(check_out).replace("Z", "+00:00"))
    start_day = datetime(start.year, start.month, start.day)
    end_day = datetime(end.year, end.month, end.day)
    nights = max(1, (end_day - start_day).days)
    return nights


def compute_bill(stay, bill_through=None, discount=None):
    through = bill_through or stay.get("check_out")
    nights = night_count(stay.get("check_in"), through)
    room_rate = float(stay.get("room_rate") or 0)
    room_total = round(nights * room_rate, 2)

    extras = stay.get("extras") or []
    extras_total = 0.0
    extra_lines = []
    for extra in extras:
        qty = max(0, int(extra.get("qty") or 0))
        unit_price = max(0.0, float(extra.get("unit_price") or 0))
        line_total = round(qty * unit_price, 2)
        extras_total += line_total
        extra_lines.append({**extra, "line_total": line_total})

    extras_total = round(extras_total, 2)
    subtotal = round(room_total + extras_total, 2)
    discount_value = float(discount if discount is not None else stay.get("discount") or 0)
    discount_value = max(0.0, min(discount_value, subtotal))
    total = round(subtotal - discount_value, 2)

    return {
        "nights": nights,
        "room_total": room_total,
        "extras_total": extras_total,
        "extra_lines": extra_lines,
        "discount": discount_value,
        "subtotal": subtotal,
        "total": total,
        "through": through,
    }


def list_rooms(db, request_type):
    # checkin -> vacant, checkout -> occupied, all -> all
    mapping = {
        "checkin": "vacant",
        "checkout": "occupied",
        "all": "all",
        "": "all",
    }
    if request_type not in mapping:
        return response(400, {"error": "type must be one of: checkin, checkout, all"})

    status_filter = mapping[request_type]
    for_checkout = request_type == "checkout"

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
            "actual_check_out": 1,
            "settled_total": 1,
        })

    open_stays = list(db["stays"].find({"status": "in"}, stay_projection))
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

        item = {
            "uuid": room_uuid,
            "room_num": room.get("room_num"),
            "active": room.get("active", True),
            "status": occupancy,
            "metadata": room.get("metadata") or {},
            "stay": build_stay_summary(stay, for_checkout=for_checkout),
        }

        if for_checkout and stay:
            item["bill"] = compute_bill(stay)

        items.append(item)

    return response(200, {
        "collection": "rooms",
        "type": request_type or "all",
        "items": items,
    })


def do_checkin(db, body):
    required_fields = [
        "room_id",
        "guest_name",
        "phone",
        "address",
        "adults",
        "children",
        "check_in",
        "check_out",
        "source",
        "room_rate",
    ]
    missing = [field for field in required_fields if body.get(field) in (None, "")]
    if missing:
        return response(400, {"error": "Missing required fields", "missing": missing})

    room_id = body["room_id"]
    room = db["rooms"].find_one({"uuid": room_id, "active": True}, {"_id": 0})
    if not room:
        return response(400, {"error": "Invalid room_id. Room does not exist or is inactive."})

    existing = db["stays"].find_one({"room_id": room_id, "status": "in"}, {"_id": 0, "id": 1})
    if existing:
        return response(409, {
            "error": "Room is already occupied",
            "stay_id": existing.get("id"),
        })

    payment_mode = body.get("payment_mode", "Cash")
    if payment_mode not in VALID_PAYMENT_MODES:
        return response(400, {"error": "payment_mode must be one of: Cash, UPI, Card"})

    stay_id = str(uuid.uuid4())
    now = datetime.utcnow()

    stay_document = {
        "id": stay_id,
        "room_id": room_id,
        "guest_name": body["guest_name"],
        "phone": body["phone"],
        "address": body["address"],
        "adults": int(body["adults"]),
        "children": int(body["children"]),
        "check_in": body["check_in"],
        "check_out": body["check_out"],
        "actual_check_out": None,
        "source": body["source"],
        "payment_mode": payment_mode,
        "room_rate": float(body["room_rate"]),
        "discount": 0.0,
        "status": "in",
        "id_front_url": body.get("id_front_url"),
        "id_back_url": body.get("id_back_url"),
        "extras": [],
        "settled_total": None,
        "created_at": now,
    }

    db["stays"].insert_one(stay_document)

    return response(201, {
        "message": "Checked in successfully",
        "type": "checkin",
        "stay_id": stay_id,
        "room_num": room.get("room_num"),
        "document": {k: v for k, v in stay_document.items() if k != "_id"},
    })


def do_checkout(db, body):
    stay_id = body.get("stay_id") or body.get("id")
    if not stay_id:
        return response(400, {"error": "stay_id is required for checkout"})

    stay = db["stays"].find_one({"id": stay_id}, {"_id": 0})
    if not stay:
        return response(404, {"error": "Stay not found"})

    if stay.get("status") != "in":
        return response(400, {"error": "Stay is already checked out"})

    bill_through = body.get("bill_through") or body.get("check_out") or stay.get("check_out")
    discount = body.get("discount", stay.get("discount", 0))
    payment_mode = body.get("payment_mode", stay.get("payment_mode") or "Cash")

    if payment_mode not in VALID_PAYMENT_MODES:
        return response(400, {"error": "payment_mode must be one of: Cash, UPI, Card"})

    bill = compute_bill(stay, bill_through=bill_through, discount=discount)
    now = datetime.utcnow()

    update = {
        "status": "out",
        "check_out": bill_through,
        "actual_check_out": now.isoformat() + "Z",
        "payment_mode": payment_mode,
        "discount": bill["discount"],
        "settled_total": bill["total"],
    }

    db["stays"].update_one({"id": stay_id}, {"$set": update})
    updated = {**stay, **update}

    return response(200, {
        "message": "Checked out successfully",
        "type": "checkout",
        "stay_id": stay_id,
        "bill": bill,
        "document": updated,
    })


def lambda_handler(event, context):
    try:
        if not event:
            return response(400, {"error": "No event body provided"})

        method = (event.get("httpMethod") or "GET").upper()

        if method == "OPTIONS":
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
            return response(401, {"error": str(e)})

        params = event.get("queryStringParameters") or {}
        body = {}
        if method in {"POST", "PUT", "PATCH"}:
            try:
                body = parse_body(event)
            except Exception as e:
                return response(400, {"error": f"Invalid JSON body: {str(e)}"})

        request_type = get_type(params, body)

        db = get_db()

        # GET: list rooms for check-in / check-out screens
        if method == "GET":
            return list_rooms(db, request_type or "all")

        # POST: perform check-in or check-out
        if method == "POST":
            if request_type == "checkin":
                return do_checkin(db, body)
            if request_type == "checkout":
                return do_checkout(db, body)
            return response(400, {
                "error": "For POST, type must be checkin or checkout",
                "examples": [
                    "POST ?type=checkin",
                    "POST ?type=checkout",
                ],
            })

        return response(405, {"error": f"Method {method} not allowed. Use GET or POST."})

    except Exception as e:
        print("[ERROR] Failed:", repr(e))
        import traceback
        traceback.print_exc()
        return response(500, {"error": "Internal server error", "details": str(e)})
