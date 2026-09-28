/*
  Stroke rehab glove - ESP32 firmware (5 flex sensors, WiFi -> backend)

  WIRING (one voltage divider per finger):
      3.3V ---[ FLEX SENSOR ]---+---[ 47k fixed resistor ]--- GND
                                |
                             ADC pin
  Bending increases the flex resistance, so the voltage at the ADC pin DROPS.

  IMPORTANT: use ADC1 pins only (GPIO 32-39). ADC2 pins stop working
  while WiFi is on.
*/

#include <WiFi.h>
#include <HTTPClient.h>

const char* WIFI_SSID  = "moto e13";
const char* WIFI_PASS  = "1234567890";
// Your laptop's LAN IP where the FastAPI backend runs
const char* SERVER_URL = "http://192.168.1.50:8000/api/glove/readings";
const char* DEVICE_ID  = "glove-01";

// thumb, index, middle, ring, little  (all ADC1)
const int FLEX_PINS[5] = {36, 39, 34, 35, 32};

const int SAMPLE_HZ  = 50;   // 50 samples/sec is plenty for finger motion
const int BATCH_SIZE = 50;   // send one batch per second

uint16_t samples[BATCH_SIZE][5];
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
    for (int f = 0; f < 5; f++) body += "," + String(samples[i][f]);
    body += "]";
    if (i < count - 1) body += ",";
  }
  body += "]}";

  HTTPClient http;
  http.begin(SERVER_URL);
  http.addHeader("Content-Type", "application/json");
  int code = http.POST(body);
  if (code != 200) Serial.printf("POST failed: %d\n", code);
  http.end();
}

void setup() {
  Serial.begin(115200);
  analogReadResolution(12);                         // 0..4095
  for (int f = 0; f < 5; f++) analogSetPinAttenuation(FLEX_PINS[f], ADC_11db); // full 0-3.3V range
  connectWiFi();
}

void loop() {
  static uint32_t nextSample = millis();
  if ((int32_t)(millis() - nextSample) < 0) return;
  nextSample += 1000 / SAMPLE_HZ;

  stamps[count] = millis();
  for (int f = 0; f < 5; f++) samples[count][f] = readAvg(FLEX_PINS[f]);

  // Also print CSV over USB, so you can log data with a laptop even without WiFi
  Serial.printf("%lu,%u,%u,%u,%u,%u\n", stamps[count],
                samples[count][0], samples[count][1], samples[count][2],
                samples[count][3], samples[count][4]);

  if (++count == BATCH_SIZE) { sendBatch(); count = 0; }
}
