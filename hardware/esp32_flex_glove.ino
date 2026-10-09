/*
  Stroke rehab glove - ESP32 firmware (4 flex sensors: index, middle, ring, pinky; WiFi -> backend)

  WIRING (one voltage divider per finger):
      3.3V ---[ FLEX SENSOR ]---+---[ 47k fixed resistor ]--- GND
                                |
                             ADC pin
  Bending increases the flex resistance, so the voltage at the ADC pin DROPS.

  IMPORTANT: use ADC1 pins only (GPIO 32-39). ADC2 pins stop working
  while WiFi is on.

  HOW IT CONNECTS TO THE WEBSITE
  1. The glove streams readings to the backend every second, all the time.
  2. The patient opens "Glove session" on the website and clicks "Start recording".
     The backend keeps the next 20 s of readings, runs the ML model and saves the result.
  3. DEVICE_ID below must match the glove ID the patient paired on the website.

  BEFORE UPLOADING
  - WIFI_SSID / WIFI_PASS: the same Wi-Fi network as your laptop.
  - SERVER_URL: your laptop's IP (Windows: run `ipconfig`, look for IPv4 Address).
  - Start the backend so other devices can reach it:
        uvicorn main:app --reload --host 0.0.0.0
    and allow Python through Windows Firewall when asked (Private networks).

  It does not matter whether your sensors read high-when-straight or
  low-when-straight: do the one-time "Calibrate glove" step on the website.
*/

#include <WiFi.h>
#include <HTTPClient.h>

const char* WIFI_SSID  = "YOUR_WIFI";
const char* WIFI_PASS  = "YOUR_PASSWORD";
// Your laptop's LAN IP where the FastAPI backend runs
const char* SERVER_URL = "http://192.168.1.50:8000/api/glove/readings";
const char* DEVICE_ID  = "glove-01";

// index, middle, ring, pinky  (all ADC1 pins) - change to match your wiring
const int NUM_FINGERS = 4;
const int FLEX_PINS[NUM_FINGERS] = {36, 39, 34, 35};

const bool PRINT_SERIAL = true;  // set false once everything works
const int SAMPLE_HZ  = 50;   // 50 samples/sec is plenty for finger motion
const int BATCH_SIZE = 50;   // send one batch per second

uint16_t samples[BATCH_SIZE][NUM_FINGERS];
uint32_t stamps[BATCH_SIZE];
int count = 0;

uint16_t readAvg(int pin) {            // average 8 reads to cut ADC noise
  uint32_t sum = 0;
  for (int k = 0; k < 8; k++) sum += analogRead(pin);
  return sum / 8;
}

void connectWiFi() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  Serial.print("Connecting");
  while (WiFi.status() != WL_CONNECTED) { delay(300); Serial.print("."); }
  Serial.print("\nConnected, IP: ");
  Serial.println(WiFi.localIP());
}

void sendBatch() {
  if (WiFi.status() != WL_CONNECTED) { connectWiFi(); return; }

  // Build JSON by hand (no extra library needed):
  // {"device_id":"glove-01","samples":[[t,f1,f2,f3,f4,f5],...]}
  String body = "{\"device_id\":\"";
  body += DEVICE_ID;
  body += "\",\"samples\":[";
  for (int i = 0; i < count; i++) {
    body += "[" + String(stamps[i]);
    for (int f = 0; f < NUM_FINGERS; f++) body += "," + String(samples[i][f]);
    body += "]";
    if (i < count - 1) body += ",";
  }
  body += "]}";

  HTTPClient http;
  http.setTimeout(2000);           // don't block sampling for long if the laptop is busy
  http.begin(SERVER_URL);
  http.addHeader("Content-Type", "application/json");
  int code = http.POST(body);
  if (code != 200) Serial.printf("POST failed: %d\n", code);
  http.end();
}

void setup() {
  Serial.begin(115200);
  analogReadResolution(12);                         // 0..4095
  for (int f = 0; f < NUM_FINGERS; f++) analogSetPinAttenuation(FLEX_PINS[f], ADC_11db); // full 0-3.3V range
  connectWiFi();
}

void loop() {
  static uint32_t nextSample = millis();
  if ((int32_t)(millis() - nextSample) < 0) return;
  nextSample += 1000 / SAMPLE_HZ;

  stamps[count] = millis();
  for (int f = 0; f < NUM_FINGERS; f++) samples[count][f] = readAvg(FLEX_PINS[f]);

  // Also print CSV over USB (Serial Monitor / Plotter) - handy for checking wiring
  if (PRINT_SERIAL) Serial.printf("%lu,%u,%u,%u,%u\n", stamps[count],
                samples[count][0], samples[count][1], samples[count][2], samples[count][3]);

  if (++count == BATCH_SIZE) { sendBatch(); count = 0; }
}
