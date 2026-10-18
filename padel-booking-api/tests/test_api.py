"""End-to-end API tests."""

from __future__ import annotations

from datetime import date, timedelta

from conftest import API, auth, login, login_tokens, register

TOMORROW = (date.today() + timedelta(days=1)).isoformat()
YESTERDAY = (date.today() - timedelta(days=1)).isoformat()


def booking_payload(court_id: int, start: str = "10:00", end: str = "11:00", day: str = TOMORROW) -> dict:
    return {
        "court_id": court_id,
        "booking_date": day,
        "start_time": start,
        "end_time": end,
        "players_count": 4,
    }


def make_booking(client, token, court_id, start="10:00", end="11:00", day=TOMORROW):
    return client.post(f"{API}/bookings", headers=auth(token), json=booking_payload(court_id, start, end, day))


# --------------------------------------------------------------------------- #
# Health & auth
# --------------------------------------------------------------------------- #
def test_health(client):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_first_user_becomes_admin(client):
    user = register(client, "boss@pytest.com")
    assert user["role"] == "admin"


def test_register_login_and_me(client):
    register(client, "ana@pytest.com", full_name="Ana")
    token = login(client, "ana@pytest.com")
    response = client.get(f"{API}/auth/me", headers=auth(token))
    assert response.status_code == 200
    assert response.json()["email"] == "ana@pytest.com"


def test_duplicate_email_conflict(client):
    register(client, "dup@pytest.com")
    response = client.post(
        f"{API}/auth/register",
        json={"email": "dup@pytest.com", "password": "Passw0rd!", "full_name": "Dup"},
    )
    assert response.status_code == 409


def test_login_wrong_password(client):
    register(client, "bob@pytest.com")
    response = client.post(
        f"{API}/auth/login", json={"email": "bob@pytest.com", "password": "wrong-pass"}
    )
    assert response.status_code == 401


def test_refresh_token(client):
    register(client, "carol@pytest.com")
    tokens = client.post(
        f"{API}/auth/login", json={"email": "carol@pytest.com", "password": "Passw0rd!"}
    ).json()
    response = client.post(
        f"{API}/auth/refresh", json={"refresh_token": tokens["refresh_token"]}
    )
    assert response.status_code == 200
    assert "access_token" in response.json()


def test_refresh_token_rotates_and_old_one_is_rejected(client):
    register(client, "rotate@pytest.com")
    tokens = login_tokens(client, "rotate@pytest.com")

    first = client.post(
        f"{API}/auth/refresh", json={"refresh_token": tokens["refresh_token"]}
    )
    assert first.status_code == 200
    rotated = first.json()
    assert rotated["refresh_token"] != tokens["refresh_token"]

    # The consumed refresh token can no longer be used.
    reused = client.post(
        f"{API}/auth/refresh", json={"refresh_token": tokens["refresh_token"]}
    )
    assert reused.status_code == 401

    # The new refresh token still works, and its access token is valid.
    again = client.post(
        f"{API}/auth/refresh", json={"refresh_token": rotated["refresh_token"]}
    )
    assert again.status_code == 200
    me = client.get(f"{API}/auth/me", headers=auth(again.json()["access_token"]))
    assert me.status_code == 200


def test_logout_revokes_access_and_refresh_tokens(client):
    register(client, "logout@pytest.com")
    tokens = login_tokens(client, "logout@pytest.com")
    access, refresh = tokens["access_token"], tokens["refresh_token"]

    assert client.get(f"{API}/auth/me", headers=auth(access)).status_code == 200

    response = client.post(
        f"{API}/auth/logout",
        headers=auth(access),
        json={"refresh_token": refresh},
    )
    assert response.status_code == 200

    # Both tokens are now blacklisted.
    assert client.get(f"{API}/auth/me", headers=auth(access)).status_code == 401
    assert (
        client.post(f"{API}/auth/refresh", json={"refresh_token": refresh}).status_code
        == 401
    )


# --------------------------------------------------------------------------- #
# Courts
# --------------------------------------------------------------------------- #
def test_only_admin_can_create_court(client, player_token):
    response = client.post(
        f"{API}/courts",
        headers=auth(player_token),
        json={"name": "Nope", "court_number": 9},
    )
    assert response.status_code == 403


def test_court_creation_includes_default_schedule(client, court):
    assert court["price_per_hour"] == "20.00"
    assert len(court["schedule"]) == 7


def test_list_courts_filters(client, court):
    response = client.get(f"{API}/courts", params={"environment": "indoor"})
    assert response.status_code == 200
    assert [c["id"] for c in response.json()] == [court["id"]]


# --------------------------------------------------------------------------- #
# Availability
# --------------------------------------------------------------------------- #
def test_availability_grid(client, court):
    response = client.get(
        f"{API}/availability/slots", params={"court_id": court["id"], "date": TOMORROW}
    )
    assert response.status_code == 200
    body = response.json()
    assert body["is_open"] is True
    assert body["slot_minutes"] == 30
    assert len(body["slots"]) > 0
    assert all(slot["status"] == "free" for slot in body["slots"])


def test_find_available_courts(client, court):
    response = client.get(
        f"{API}/availability/courts",
        params={"date": TOMORROW, "start_time": "10:00", "end_time": "11:00"},
    )
    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    assert body[0]["court"]["id"] == court["id"]
    assert body[0]["total_price"] == "20.00"


# --------------------------------------------------------------------------- #
# Bookings
# --------------------------------------------------------------------------- #
def test_create_booking_and_price(client, court, player_token):
    response = make_booking(client, player_token, court["id"])
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["status"] == "confirmed"
    assert body["duration_minutes"] == 60
    assert body["total_price"] == "20.00"
    assert body["payments"][0]["status"] == "pending"


def test_double_booking_conflict(client, court, player_token, player2_token):
    assert make_booking(client, player_token, court["id"]).status_code == 201
    response = make_booking(client, player2_token, court["id"])
    assert response.status_code == 409


def test_same_player_overlap_conflict(client, court, player_token):
    assert make_booking(client, player_token, court["id"], "10:00", "11:00").status_code == 201
    response = make_booking(client, player_token, court["id"], "10:30", "11:30")
    assert response.status_code == 409


def test_adjacent_booking_is_allowed(client, court, player_token, player2_token):
    assert make_booking(client, player2_token, court["id"], "10:00", "11:00").status_code == 201
    response = make_booking(client, player_token, court["id"], "11:00", "12:00")
    assert response.status_code == 201


def test_booking_in_the_past_is_rejected(client, court, player_token):
    response = make_booking(client, player_token, court["id"], day=YESTERDAY)
    assert response.status_code == 400


def test_outside_opening_hours_is_rejected(client, court, player_token):
    response = make_booking(client, player_token, court["id"], "06:00", "07:00")
    assert response.status_code == 409


def test_max_duration_is_enforced(client, court, player_token):
    response = make_booking(client, player_token, court["id"], "08:00", "12:00")
    assert response.status_code == 400


def test_time_grid_alignment_is_enforced(client, court, player_token):
    response = make_booking(client, player_token, court["id"], "10:15", "11:15")
    assert response.status_code == 400


def test_cancel_frees_the_slot(client, court, player_token, player2_token):
    booking = make_booking(client, player_token, court["id"]).json()
    response = client.post(
        f"{API}/bookings/{booking['id']}/cancel",
        headers=auth(player_token),
        json={"reason": "changed my mind"},
    )
    assert response.status_code == 200
    assert response.json()["status"] == "cancelled"

    # The slot must be free again and bookable by another player.
    assert make_booking(client, player2_token, court["id"]).status_code == 201


def test_reschedule_booking(client, court, player_token):
    booking = make_booking(client, player_token, court["id"], "10:00", "11:00").json()
    response = client.patch(
        f"{API}/bookings/{booking['id']}",
        headers=auth(player_token),
        json={"start_time": "12:00", "end_time": "13:00"},
    )
    assert response.status_code == 200, response.text
    assert response.json()["start_time"] == "12:00:00"


def test_player_cannot_see_other_booking(client, court, player_token, player2_token):
    booking = make_booking(client, player_token, court["id"]).json()
    response = client.get(f"{API}/bookings/{booking['id']}", headers=auth(player2_token))
    assert response.status_code == 403


def test_staff_can_list_all_bookings(client, court, player_token, admin_token):
    make_booking(client, player_token, court["id"])
    response = client.get(
        f"{API}/bookings", headers=auth(admin_token), params={"scope": "all"}
    )
    assert response.status_code == 200
    assert len(response.json()) == 1


# --------------------------------------------------------------------------- #
# Payments
# --------------------------------------------------------------------------- #
def test_mark_payment_as_paid(client, court, player_token):
    booking = make_booking(client, player_token, court["id"]).json()
    payment_id = booking["payments"][0]["id"]
    response = client.post(
        f"{API}/payments/{payment_id}/pay",
        headers=auth(player_token),
        json={"transaction_ref": "tx-123"},
    )
    assert response.status_code == 200
    assert response.json()["status"] == "paid"


# --------------------------------------------------------------------------- #
# Reviews
# --------------------------------------------------------------------------- #
def test_review_requires_a_booking(client, court, player_token):
    response = client.post(
        f"{API}/courts/{court['id']}/reviews",
        headers=auth(player_token),
        json={"rating": 5, "comment": "Great"},
    )
    assert response.status_code == 403


def test_review_after_booking(client, court, player_token):
    make_booking(client, player_token, court["id"])
    response = client.post(
        f"{API}/courts/{court['id']}/reviews",
        headers=auth(player_token),
        json={"rating": 5, "comment": "Great court"},
    )
    assert response.status_code == 201
    detail = client.get(f"{API}/courts/{court['id']}").json()
    assert detail["average_rating"] == 5.0
    assert detail["review_count"] == 1


# --------------------------------------------------------------------------- #
# Matchmaking
# --------------------------------------------------------------------------- #
def test_matchmaking_flow(client, player_token, player2_token):
    created = client.post(
        f"{API}/matches",
        headers=auth(player_token),
        json={
            "match_date": TOMORROW,
            "start_time": "18:00",
            "players_needed": 1,
            "min_level": 1.0,
            "max_level": 5.0,
        },
    )
    assert created.status_code == 201, created.text
    match_id = created.json()["id"]

    applied = client.post(
        f"{API}/matches/{match_id}/apply",
        headers=auth(player2_token),
        json={"message": "I'm in"},
    )
    assert applied.status_code == 201, applied.text
    application_id = applied.json()["id"]

    accepted = client.post(
        f"{API}/matches/{match_id}/applications/{application_id}/accept",
        headers=auth(player_token),
    )
    assert accepted.status_code == 200
    assert accepted.json()["status"] == "accepted"

    detail = client.get(f"{API}/matches/{match_id}", headers=auth(player_token)).json()
    assert detail["status"] == "full"
    assert detail["accepted_count"] == 1


def test_cannot_apply_to_own_match(client, player_token):
    created = client.post(
        f"{API}/matches",
        headers=auth(player_token),
        json={"match_date": TOMORROW, "start_time": "18:00"},
    ).json()
    response = client.post(
        f"{API}/matches/{created['id']}/apply", headers=auth(player_token), json={}
    )
    assert response.status_code == 400


# --------------------------------------------------------------------------- #
# Stats
# --------------------------------------------------------------------------- #
def test_dashboard_stats(client, court, player_token, admin_token):
    make_booking(client, player_token, court["id"])
    response = client.get(f"{API}/stats/dashboard", headers=auth(admin_token))
    assert response.status_code == 200
    body = response.json()
    assert body["total_courts"] == 1
    assert body["upcoming_bookings"] == 1
    assert len(body["occupancy"]) == 1
    assert body["occupancy"][0]["booked_minutes"] == 60
