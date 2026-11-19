import json
import uuid
from datetime import datetime, timezone

import boto3
from boto3.dynamodb.conditions import Attr

TABLE_NAME = "Book-Appointment-Dynamo-Table"

dynamodb = boto3.resource("dynamodb")
table = dynamodb.Table(TABLE_NAME)

SLOTS = [
    "9:00 AM",
    "10:00 AM",
    "11:00 AM",
    "1:00 PM",
    "2:00 PM",
    "3:00 PM"
]

CORS_HEADERS = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
}


def response(status_code, data):
    return {
        "statusCode": status_code,
        "headers": CORS_HEADERS,
        "body": json.dumps(data)
    }


def get_appointments_for_date(appointment_date):
    """Read all appointments matching the selected date."""
    appointments = []
    scan_kwargs = {
        "FilterExpression": Attr("appointmentDate").eq(
            appointment_date
        )
    }

    while True:
        result = table.scan(**scan_kwargs)
        appointments.extend(result.get("Items", []))

        last_key = result.get("LastEvaluatedKey")
        if not last_key:
            break

        scan_kwargs["ExclusiveStartKey"] = last_key

    return appointments


def lambda_handler(event, context):
    try:
        # Identify the HTTP method and route.
        request_context = event.get("requestContext", {})
        http_info = request_context.get("http", {})

        method = (
            http_info.get("method")
            or event.get("httpMethod")
            or event.get("routeKey", "").split(" ")[0]
        )

        path = event.get("rawPath") or event.get("path") or ""

        if method == "OPTIONS":
            return response(200, {"message": "OK"})

        # GET /availability
        if method == "GET" and (
            path.endswith("/availability")
            or event.get("routeKey") == "GET /availability"
        ):
            params = event.get("queryStringParameters") or {}
            appointment_date = params.get("appointmentDate")

            if not appointment_date:
                return response(400, {
                    "message": "appointmentDate is required (YYYY-MM-DD)"
                })

            try:
                selected_date = datetime.strptime(
                    appointment_date, "%Y-%m-%d"
                ).date()
            except ValueError:
                return response(400, {
                    "message": "Use a valid date in YYYY-MM-DD format"
                })

            if selected_date.weekday() >= 5:
                return response(200, {
                    "appointmentDate": appointment_date,
                    "availableSlots": []
                })

            appointments = get_appointments_for_date(
                appointment_date
            )

            booked_slots = {
                item.get("appointmentTime")
                for item in appointments
            }

            available_slots = [
                slot for slot in SLOTS
                if slot not in booked_slots
            ]

            return response(200, {
                "appointmentDate": appointment_date,
                "availableSlots": available_slots
            })

        # POST /appointments
        if method == "POST" and (
            path.endswith("/appointments")
            or event.get("routeKey") == "POST /appointments"
            or not method
        ):
            body = event.get("body")

            if isinstance(body, str):
                body = json.loads(body)
            elif not isinstance(body, dict):
                body = event

            customer_name = body.get("customerName")
            appointment_date = body.get("appointmentDate")
            appointment_time = body.get("appointmentTime")

            if not all([
                customer_name,
                appointment_date,
                appointment_time
            ]):
                return response(400, {
                    "message": (
                        "customerName, appointmentDate, and "
                        "appointmentTime are required"
                    )
                })

            try:
                selected_date = datetime.strptime(
                    appointment_date, "%Y-%m-%d"
                ).date()
            except ValueError:
                return response(400, {
                    "message": "Use a valid date in YYYY-MM-DD format"
                })

            if selected_date.weekday() >= 5:
                return response(400, {
                    "message": "Appointments are available Monday to Friday"
                })

            if appointment_time not in SLOTS:
                return response(400, {
                    "message": "Please choose an available working-hour slot"
                })

            appointments = get_appointments_for_date(
                appointment_date
            )

            if any(
                item.get("appointmentTime") == appointment_time
                for item in appointments
            ):
                return response(409, {
                    "message": "This appointment slot is already booked"
                })

            appointment = {
                "appointmentId": str(uuid.uuid4()),
                "customerName": customer_name,
                "appointmentDate": appointment_date,
                "appointmentTime": appointment_time,
                "createdAt": datetime.now(timezone.utc).isoformat()
            }

            table.put_item(Item=appointment)

            return response(201, {
                "message": "Appointment saved successfully",
                "appointment": appointment
            })

        return response(404, {"message": "Route not found"})

    except Exception as error:
        print(f"Error processing appointment request: {error}")
        return response(500, {
            "message": "Unable to process the appointment request"
        })
