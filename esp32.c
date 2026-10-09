#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <time.h>

const char* WIFI_SSID = "YOUR_WIFI_NAME";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";

// Replace with your actual Render URL.
const char* BACKEND_URL =
  "https://YOUR-SERVICE.onrender.com/energy";

const char* METER_ID = "ESP32-001";

bool connectWiFi() {
  if (WiFi.status() == WL_CONNECTED) {
    return true;
  }

  Serial.print("Connecting to Wi-Fi");
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  unsigned long started = millis();

  while (
    WiFi.status() != WL_CONNECTED &&
    millis() - started < 30000UL
  ) {
    delay(500);
    Serial.print(".");
  }

  Serial.println();

  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("Wi-Fi connection failed.");
    return false;
  }

  Serial.print("Connected. IP: ");
  Serial.println(WiFi.localIP());
  return true;
}

String getReadingDate() {
  struct tm timeInfo;

  if (!getLocalTime(&timeInfo, 10000)) {
    return "";
  }

  char date[11];
  strftime(date, sizeof(date), "%Y-%m-%d", &timeInfo);

  return String(date);
}

void sendEnergyReading(uint32_t energyWh) {
  if (!connectWiFi()) {
    return;
  }

  String date = getReadingDate();

  if (date.isEmpty()) {
    Serial.println("Time unavailable. Reading not sent.");
    return;
  }

  String body =
    String("{\"meterId\":\"") + METER_ID +
    "\",\"date\":\"" + date +
    "\",\"energyWh\":" + String(energyWh) + "}";

  WiFiClientSecure client;

  // Temporary Devnet connectivity test.
  // Replace with certificate validation for actual use.
  client.setInsecure();

  HTTPClient http;
  http.setConnectTimeout(20000);
  http.setTimeout(120000);

  if (!http.begin(client, BACKEND_URL)) {
    Serial.println("Could not open backend URL.");
    return;
  }

  http.addHeader("Content-Type", "application/json");

  Serial.println("Sending:");
  Serial.println(body);

  int status = http.POST(body);

  Serial.print("HTTP status: ");
  Serial.println(status);

  if (status > 0) {
    Serial.println("Response:");
    Serial.println(http.getString());
  } else {
    Serial.print("Connection error: ");
    Serial.println(HTTPClient::errorToString(status));
  }

  http.end();

  Serial.println(
    "Before retrying a failed request, check /energy "
    "for a record that may already have been stored."
  );
}

void setup() {
  Serial.begin(115200);
  delay(1000);

  if (connectWiFi()) {
    // Nigeria time: UTC+1, no daylight saving.
    configTime(
      3600,
      0,
      "pool.ntp.org",
      "time.google.com"
    );
  }

  Serial.println();
  Serial.println("Type s and press Send to submit 1250 Wh.");
}

void loop() {
  if (Serial.available()) {
    char command = Serial.read();

    if (command == 's' || command == 'S') {
      sendEnergyReading(1250);
      Serial.println("Type s to submit another sample.");
    }
  }

  delay(10);
}