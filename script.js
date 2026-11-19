
const API_BASE_URL = "https://lf5rstdqb3.execute-api.us-east-2.amazonaws.com";

const form = document.getElementById("appointmentForm");
const customerNameInput = document.getElementById("customerName");
const dateInput = document.getElementById("date");
const slotsContainer = document.getElementById("slots");
const slotHelp = document.getElementById("slotHelp");
const message = document.getElementById("message");
const submitButton = document.getElementById("submitButton");

let selectedTime = null;

function getApiBaseUrl() {
    const baseUrl = API_BASE_URL.trim().replace(/\/+$/, "");

    if (!baseUrl.startsWith("https://")) {
        throw new Error(
            "Add your HTTPS API Gateway Invoke URL in script.js."
        );
    }

    return baseUrl;
}

function getLocalDateString() {
    const today = new Date();

    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, "0");
    const day = String(today.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
}

dateInput.min = getLocalDateString();

function clearSelectedTime() {
    selectedTime = null;

    slotsContainer
        .querySelectorAll('input[name="appointmentTime"]')
        .forEach((radio) => {
            radio.checked = false;
        });

    slotsContainer
        .querySelectorAll(".slot-option")
        .forEach((option) => {
            option.classList.remove("selected");
        });
}

function displaySlots(availableSlots) {
    slotsContainer.replaceChildren();
    clearSelectedTime();

    if (availableSlots.length === 0) {
        slotHelp.textContent =
            "No appointment times are available for this date.";
        return;
    }

    availableSlots.forEach((slot) => {
        const label = document.createElement("label");
        label.className = "slot-option";

        const radio = document.createElement("input");
        radio.type = "radio";
        radio.name = "appointmentTime";
        radio.value = slot;
        radio.required = true;

        const text = document.createElement("span");
        text.textContent = slot;

        radio.addEventListener("change", () => {
            selectedTime = slot;

            slotsContainer
                .querySelectorAll(".slot-option")
                .forEach((option) => {
                    option.classList.remove("selected");
                });

            label.classList.add("selected");
            message.textContent = `Selected time: ${slot}.`;
        });

        label.append(radio, text);
        slotsContainer.appendChild(label);
    });

    slotHelp.textContent = "Select one of the available times.";
}

async function loadAvailableSlots({ showStatus = true } = {}) {
    slotsContainer.replaceChildren();
    selectedTime = null;

    const appointmentDate = dateInput.value;

    if (!appointmentDate) {
        slotHelp.textContent = "Choose a date to see available times.";
        return;
    }

    // Do not request weekend appointments.
    const weekday = new Date(
        `${appointmentDate}T12:00:00`
    ).getDay();

    if (weekday === 0 || weekday === 6) {
        slotHelp.textContent =
            "Please choose a weekday, Monday through Friday.";

        if (showStatus) {
            message.textContent =
                "Appointments are not available on weekends.";
        }

        return;
    }

    slotHelp.textContent = "Loading available times...";

    if (showStatus) {
        message.textContent = "";
    }

    try {
        const baseUrl = getApiBaseUrl();
        const url =
            `${baseUrl}/availability?appointmentDate=` +
            encodeURIComponent(appointmentDate);

        const response = await fetch(url);
        const data = await response.json();

        if (!response.ok) {
            throw new Error(
                data.message || `Request failed (${response.status})`
            );
        }

        const availableSlots = Array.isArray(data.availableSlots)
            ? data.availableSlots
            : [];

        displaySlots(availableSlots);

        if (availableSlots.length === 0) {
            slotHelp.textContent =
                "No available times. Please choose another date.";
        }
    } catch (error) {
        console.error("Availability error:", error);

        slotHelp.textContent =
            "We couldn't load the available times.";

        message.textContent = showStatus
            ? `Availability error: ${error.message}`
            : "Your appointment was booked, but the availability list " +
              "could not be refreshed. Please change the date to retry.";
    }
}

dateInput.addEventListener("change", () => {
    loadAvailableSlots();
});

form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const customerName = customerNameInput.value.trim();
    const appointmentDate = dateInput.value;

    if (!customerName) {
        message.textContent = "Please enter your full name.";
        customerNameInput.focus();
        return;
    }

    if (!appointmentDate || !selectedTime) {
        message.textContent =
            "Please choose an appointment date and available time.";
        return;
    }

    const appointment = {
        customerName,
        appointmentDate,
        appointmentTime: selectedTime
    };

    submitButton.disabled = true;
    submitButton.textContent = "Booking...";

    try {
        const baseUrl = getApiBaseUrl();

        const response = await fetch(`${baseUrl}/appointments`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(appointment)
        });

        const data = await response.json();

        if (response.status === 409) {
            message.textContent =
                data.message ||
                "That time has already been booked. Please choose another.";

            await loadAvailableSlots({ showStatus: false });
            return;
        }

        if (!response.ok) {
            throw new Error(
                data.message || `Booking failed (${response.status})`
            );
        }

        message.textContent =
            `Appointment booked successfully for ${appointmentDate} ` +
            `at ${appointment.appointmentTime}.`;

        // Refresh the slots so the booked time disappears.
        await loadAvailableSlots({ showStatus: false });

    } catch (error) {
        console.error("Booking error:", error);

        message.textContent =
            `We couldn't complete the booking: ${error.message}`;
    } finally {
        submitButton.disabled = false;
        submitButton.textContent = "Book Appointment";
    }
});
