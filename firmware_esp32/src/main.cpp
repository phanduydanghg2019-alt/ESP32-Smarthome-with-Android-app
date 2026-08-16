// ================== THƯ VIỆN ==================
#include <Arduino.h>
#include <WiFi.h>
#include "DHT.h"
#include <ESP32Servo.h>
#include <FirebaseESP32.h>
#include <addons/TokenHelper.h>
#include <addons/RTDBHelper.h>

// ================== CẤU HÌNH PHẦN CỨNG ==================
// Chân GPIO kết nối cảm biến DHT11
#define DHTPIN 21
// Loại cảm biến DHT (DHT11 hoặc DHT22)
#define DHTTYPE DHT11
// Chân GPIO kết nối cảm biến mưa (ngõ ra digital, LOW = có mưa)
#define RAIN_PIN 36
// Chân GPIO kết nối servo mái che
#define MAICHE_PIN 14
// Chân GPIO kết nối servo cửa
#define DOOR_PIN 27

// ================== CẤU HÌNH WIFI ==================
// Tên mạng WiFi cần kết nối
#define WIFI_SSID "Mitau"
// Mật khẩu WiFi
#define WIFI_PASSWORD "jack05cu"

// ================== CẤU HÌNH FIREBASE ==================
// API Key của Firebase project
#define API_KEY "AIzaSyBeWrNXapd0tCRWgj8773vRTyy0MMQNw2w"
// URL của Firebase Realtime Database
#define DATABASE_URL "https://smarthome-d0827-default-rtdb.asia-southeast1.firebasedatabase.app"
// Email đăng nhập Firebase
#define USER_EMAIL "esp32smarthome@ctu.edu.vn"
// Mật khẩu đăng nhập Firebase
#define USER_PASSWORD "123456"

// ================== BIẾN TOÀN CỤC ==================
// Đối tượng cảm biến DHT
DHT dht(DHTPIN, DHTTYPE);
// Đối tượng servo điều khiển mái che
Servo servoMaiche;
// Đối tượng servo điều khiển cửa
Servo servoDoor;

// Đối tượng FirebaseData cho các thao tác đọc/ghi thông thường
FirebaseData fbdo;
// Đối tượng FirebaseData cho stream listener
FirebaseData stream;
// Đối tượng FirebaseAuth chứa thông tin xác thực
FirebaseAuth auth;
// Đối tượng FirebaseConfig chứa cấu hình kết nối
FirebaseConfig config;

// Độ ẩm hiện tại từ cảm biến DHT
float g_humi = 0;
// Nhiệt độ hiện tại từ cảm biến DHT
float g_temp = 0;
// Trạng thái mưa (true = đang mưa, false = không mưa)
bool g_isRaining = false;
// Trạng thái cửa chính (true = cửa mở, false = cửa đóng)
bool g_mainDoorState = false;
// Trạng thái mái che (true = mái che mở, false = mái che đóng)
bool g_shelterState = false;

// Map đơn giản để cache thông tin thiết bị (roomId/deviceId) -> (pin, type)
// Giúp tránh phải gọi getJSON nhiều lần
const int MAX_DEVICES = 40;
// Mảng lưu key của thiết bị dạng "roomId/deviceId"
String g_deviceKeys[MAX_DEVICES];
// Mảng lưu số chân GPIO tương ứng với mỗi thiết bị
int g_devicePins[MAX_DEVICES];
// Mảng lưu loại thiết bị tương ứng
String g_deviceTypes[MAX_DEVICES];
// Số lượng thiết bị đã được cache
int g_deviceCount = 0;

// Thời điểm lần cuối gửi dữ liệu cảm biến lên Firebase
unsigned long lastSensorSend = 0;

// ================== HÀM ĐIỀU KHIỂN ==================
// Đăng ký hoặc cập nhật mapping thiết bị vào cache
// idKey: chuỗi dạng "roomId/deviceId"
// pin: số chân GPIO của thiết bị
// type: loại thiết bị
void registerDeviceMapping(const String &idKey, int pin, const String &type) {
  // Tìm và cập nhật nếu thiết bị đã tồn tại trong cache
  for (int i = 0; i < g_deviceCount; i++) {
    if (g_deviceKeys[i] == idKey) {
      g_devicePins[i] = pin;
      g_deviceTypes[i] = type;
      return;
    }
  }
  // Thêm mới vào cache nếu còn chỗ
  if (g_deviceCount < MAX_DEVICES) {
    g_deviceKeys[g_deviceCount] = idKey;
    g_devicePins[g_deviceCount] = pin;
    g_deviceTypes[g_deviceCount] = type;
    g_deviceCount++;
  }
}

// Lấy thông tin thiết bị từ cache
// idKey: chuỗi dạng "roomId/deviceId"
// pinOut: tham chiếu để trả về số chân GPIO
// typeOut: tham chiếu để trả về loại thiết bị
// Trả về true nếu tìm thấy, false nếu không có trong cache
bool getDeviceMapping(const String &idKey, int &pinOut, String &typeOut) {
  for (int i = 0; i < g_deviceCount; i++) {
    if (g_deviceKeys[i] == idKey) {
      pinOut = g_devicePins[i];
      typeOut = g_deviceTypes[i];
      return true;
    }
  }
  return false;
}

// Lấy thông tin thiết bị từ Firebase và cache vào bộ nhớ
// roomId: ID của phòng chứa thiết bị
// deviceId: ID của thiết bị
// pinOut: tham chiếu để trả về số chân GPIO
// typeOut: tham chiếu để trả về loại thiết bị
// Trả về true nếu lấy thành công, false nếu thất bại
bool fetchAndCacheDevice(const String &roomId,
                         const String &deviceId,
                         int &pinOut,
                         String &typeOut) {
  String devicePath = "/rooms/" + roomId + "/devices/" + deviceId;

  bool pinOk = false;
  bool typeOk = false;

  // Thử lấy toàn bộ JSON object của thiết bị
  if (Firebase.getJSON(fbdo, devicePath)) {
    FirebaseJson json = fbdo.jsonObject();
    FirebaseJsonData pinData, typeData;
    json.get(pinData, "pin");
    json.get(typeData, "type");

    if (pinData.success) {
      String pinStr = pinData.to<String>();
      pinOut = pinStr.toInt();
      pinOk = true;
    }
    if (typeData.success) {
      typeOut = typeData.to<String>();
      typeOk = true;
    }
  }

  // Nếu lấy thành công cả pin và type, cache vào bộ nhớ
  if (pinOk && typeOk) {
    String key = roomId + "/" + deviceId;
    registerDeviceMapping(key, pinOut, typeOut);
    return true;
  }

  return false;
}

// Đảm bảo có mapping cho thiết bị (lấy từ cache hoặc Firebase)
// roomId: ID của phòng chứa thiết bị
// deviceId: ID của thiết bị
// pinOut: tham chiếu để trả về số chân GPIO
// typeOut: tham chiếu để trả về loại thiết bị
// Trả về true nếu có mapping, false nếu không thể lấy được
bool ensureDeviceMapping(const String &roomId,
                         const String &deviceId,
                         int &pinOut,
                         String &typeOut) {
  String key = roomId + "/" + deviceId;
  // Thử lấy từ cache trước
  if (getDeviceMapping(key, pinOut, typeOut)) return true;
  // Nếu không có trong cache, lấy từ Firebase
  return fetchAndCacheDevice(roomId, deviceId, pinOut, typeOut);
}

// Điều khiển mái che mở/đóng
// open: true = mở mái che, false = đóng mái che
void setShelter(bool open) {
  servoMaiche.write(open ? 0 : 90);
  g_shelterState = open;
}

// Điều khiển cửa chính mở/đóng
// open: true = mở cửa, false = đóng cửa
void setDoor(bool open) {
  servoDoor.write(open ? 90 : 0);
  g_mainDoorState = open;
}

// Đọc và cập nhật trạng thái cảm biến mưa với bộ lọc chống nhiễu
void updateRainStatus() {
  static bool lastRawState = false;
  static uint8_t sameCount = 0;

  // Đọc giá trị digital từ cảm biến mưa
  int rainDigital = digitalRead(RAIN_PIN);
  // LOW = đang mưa (tùy theo module cảm biến)
  bool rawIsRaining = (rainDigital == LOW);

  // Đếm số lần đọc liên tiếp giống nhau để lọc nhiễu
  if (rawIsRaining == lastRawState) {
    if (sameCount < 10) sameCount++;
  } else {
    sameCount = 0;
    lastRawState = rawIsRaining;
  }

  // Chỉ cập nhật trạng thái khi đọc được liên tục 3 lần giống nhau
  if (sameCount >= 3) {
    g_isRaining = rawIsRaining;
  }
}

// Đọc nhiệt độ và độ ẩm từ cảm biến DHT
void readDHT() {
  g_humi = dht.readHumidity();
  g_temp = dht.readTemperature();
  // Bỏ qua nếu đọc lỗi
  if (isnan(g_humi) || isnan(g_temp)) {
    return;
  }
}

// Điều khiển thiết bị GPIO dựa trên pin và trạng thái
// pin: số chân GPIO cần điều khiển
// state: trạng thái (true = ON/HIGH, false = OFF/LOW)
// type: loại thiết bị (chỉ để tham khảo, không ảnh hưởng logic)
void controlDevice(int pin, bool state, String type) {
  // Cấu hình chân GPIO là OUTPUT
  pinMode(pin, OUTPUT);
  // Ghi giá trị HIGH hoặc LOW tùy theo state
  digitalWrite(pin, state ? HIGH : LOW);
}

// Callback xử lý thay đổi realtime từ Firebase stream
// data: dữ liệu stream từ Firebase
void streamCallback(StreamData data) {
  String path = data.dataPath();

  // Xử lý khi path kết thúc bằng "/state" (cập nhật trạng thái thiết bị)
  if (path.endsWith("/state")) {
    bool newState = data.boolData();

    // Lấy roomId và deviceId từ path
    String p = path;
    if (p.startsWith("/")) p = p.substring(1);

    int firstSlash = p.indexOf('/');
    int secondSlash = p.indexOf('/', firstSlash + 1);
    int thirdSlash = p.indexOf('/', secondSlash + 1);

    String roomId = p.substring(0, firstSlash);
    String deviceId = p.substring(secondSlash + 1, thirdSlash);

    // Lấy pin và type từ mapping, sau đó điều khiển thiết bị
    int pin = -1;
    String type;
    if (ensureDeviceMapping(roomId, deviceId, pin, type)) {
      controlDevice(pin, newState, type);
    }
  }
  // Xử lý khi cập nhật toàn bộ device object (dạng JSON)
  else if (data.dataType() == "json") {
    FirebaseJson json = data.jsonObject();

    FirebaseJsonData pinData, stateData, typeData, nameData;
    json.get(pinData, "pin");
    json.get(stateData, "state");
    json.get(typeData, "type");
    json.get(nameData, "name");

    // Lấy roomId và deviceId từ path
    String p = path;
    if (p.startsWith("/")) p = p.substring(1);
    int firstSlash = p.indexOf('/');
    int secondSlash = p.indexOf('/', firstSlash + 1);
    String roomId = p.substring(0, firstSlash);
    String deviceId = p.substring(secondSlash + 1);
    String key = roomId + "/" + deviceId;

    // Nếu có đủ thông tin (pin, state, type) -> cập nhật mapping và điều khiển
    if (pinData.success && stateData.success && typeData.success) {
      int pin = pinData.to<int>();
      bool state = stateData.to<bool>();
      String type = typeData.to<String>();

      registerDeviceMapping(key, pin, type);
      controlDevice(pin, state, type);
    }
    // Nếu chỉ có state mà thiếu pin/type -> dùng mapping đã có để điều khiển
    else if (stateData.success && (!pinData.success || !typeData.success)) {
      bool state = stateData.to<bool>();
      int pin = -1;
      String type;
      if (ensureDeviceMapping(roomId, deviceId, pin, type)) {
        controlDevice(pin, state, type);
      }
    }
  }
}

// Đọc trạng thái cửa chính từ Firebase và điều khiển servo cửa
// Node: /controls/mainDoor = true/false
void syncMainDoorFromFirebase() {
  if (!Firebase.ready()) return;

  // Chống dội
  static unsigned long lastCheck = 0;
  unsigned long now = millis();
  if (now - lastCheck < 500) return;
  lastCheck = now;

  // Đọc trạng thái cửa từ Firebase
  if (Firebase.getBool(fbdo, "/controls/mainDoor")) {
    bool desiredState = fbdo.boolData();
    // Chỉ cập nhật nếu trạng thái thay đổi
    if (desiredState != g_mainDoorState) {
      setDoor(desiredState);
    }
  }
}

// Đồng bộ điều khiển mái che từ Firebase với ưu tiên người dùng > cảm biến mưa
// Ưu tiên xử lý:
// 1. Nếu /controls/shelter có override=true -> luôn theo state (người dùng)
// 2. Nếu không có override nhưng có state -> coi như override tạm thời
// 3. Nếu không có state hoặc override=false -> theo cảm biến mưa (g_isRaining)
void syncShelterFromFirebase() {
  if (!Firebase.ready()) return;

  // Giới hạn tần suất kiểm tra để tránh gọi quá dày
  static unsigned long lastCheck = 0;
  unsigned long now = millis();
  if (now - lastCheck < 500) return;
  lastCheck = now;

  // Đọc cấu hình mái che từ Firebase
  if (Firebase.getJSON(fbdo, "/controls/shelter")) {
    FirebaseJson json = fbdo.jsonObject();
    FirebaseJsonData overrideData, stateData;
    json.get(overrideData, "override");
    json.get(stateData, "state");

    bool hasState = stateData.success;
    bool manualState = hasState && stateData.to<bool>();

    // Xác định xem có override từ người dùng không
    bool overrideFlag = overrideData.success ? overrideData.to<bool>() : false;
    bool isUserOverride = (overrideFlag && hasState) || (!overrideData.success && hasState);

    if (isUserOverride) {
      // Người dùng -> ưu tiên cao hơn cảm biến
      if (manualState != g_shelterState) {
        setShelter(manualState);
      }
    } else {
      // Không override -> theo cảm biến mưa (có mưa thì mở mái che)
      bool autoState = g_isRaining;
      if (autoState != g_shelterState) {
        setShelter(autoState);
      }
    }
  } else {
    // Nếu không đọc được từ Firebase -> mặc định theo cảm biến mưa
    bool autoState = g_isRaining;
    if (autoState != g_shelterState) {
      setShelter(autoState);
    }
  }
}

// Đồng bộ ban đầu tất cả devices trong mọi phòng từ Firebase
void initialSyncDevices() {
  // Lấy toàn bộ dữ liệu rooms từ Firebase
  if (!Firebase.getJSON(fbdo, "/rooms")) {
    return;
  }

  FirebaseJson devicesJson = fbdo.jsonObject();
  size_t count = devicesJson.iteratorBegin();
  String key, value;
  int type;

  // Duyệt qua từng phòng
  for (size_t i = 0; i < count; i++) {
    devicesJson.iteratorGet(i, type, key, value);

    if (type == FirebaseJson::JSON_OBJECT) {
      String roomId = key;

      FirebaseJson roomJson;
      roomJson.setJsonData(value);

      // Lấy node devices bên trong từng phòng
      FirebaseJsonData devicesNode;
      roomJson.get(devicesNode, "devices");
      if (!devicesNode.success) continue;

      FirebaseJson roomDevices;
      roomDevices.setJsonData(devicesNode.to<String>());

      size_t devCount = roomDevices.iteratorBegin();
      String devKey, devValue;
      int devTypeCode;

      // Duyệt qua từng thiết bị trong phòng
      for (size_t j = 0; j < devCount; j++) {
        roomDevices.iteratorGet(j, devTypeCode, devKey, devValue);
        if (devTypeCode != FirebaseJson::JSON_OBJECT) continue;

        FirebaseJson deviceJson;
        deviceJson.setJsonData(devValue);

        FirebaseJsonData pinData, stateData, typeData, nameData;
        deviceJson.get(pinData, "pin");
        deviceJson.get(stateData, "state");
        deviceJson.get(typeData, "type");
        deviceJson.get(nameData, "name");

        // Nếu có đủ thông tin, cache mapping và điều khiển thiết bị
        if (pinData.success && stateData.success && typeData.success) {
          int pin = pinData.to<int>();
          bool state = stateData.to<bool>();
          String devType = typeData.to<String>();

          String mapKey = roomId + "/" + devKey;
          registerDeviceMapping(mapKey, pin, devType);
          controlDevice(pin, state, devType);
        }
      }

      roomDevices.iteratorEnd();
    }
  }

  devicesJson.iteratorEnd();
}

// ================== SETUP & LOOP ==================
void setup() {
  Serial.begin(115200);
  delay(500);

  // Cấu hình các chân GPIO cho cảm biến và servo
  pinMode(RAIN_PIN, INPUT_PULLUP);
  servoMaiche.attach(MAICHE_PIN);
  servoDoor.attach(DOOR_PIN);
  dht.begin();

  // Kết nối WiFi
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  while (WiFi.status() != WL_CONNECTED) {
    delay(300);
  }

  // Cấu hình Firebase
  config.api_key = API_KEY;
  config.database_url = DATABASE_URL;
  config.token_status_callback = tokenStatusCallback;

  auth.user.email = USER_EMAIL;
  auth.user.password = USER_PASSWORD;

  Firebase.reconnectNetwork(true);
  Firebase.reconnectWiFi(true);

  // Tăng buffer size để stream ổn định hơn
  fbdo.setBSSLBufferSize(8192, 2048);
  fbdo.setResponseSize(4096);

  Firebase.begin(&config, &auth);

  // Chờ kết nối Firebase (tối đa 10 giây)
  unsigned long t0 = millis();
  while (!Firebase.ready() && millis() - t0 < 10000) {
    delay(500);
  }

  // Đồng bộ ban đầu tất cả devices
  initialSyncDevices();

  // Bắt đầu stream listener tại path "/rooms"
  Firebase.beginStream(stream, "/rooms");
  Firebase.setStreamCallback(stream, streamCallback, streamTimeoutCallback);
}

void loop() {
  // Đọc cảm biến nhiệt độ, độ ẩm và mưa
  readDHT();
  updateRainStatus();

  // Đồng bộ điều khiển cửa và mái che từ Firebase
  syncMainDoorFromFirebase();
  syncShelterFromFirebase();

  // Gửi dữ liệu cảm biến lên Firebase mỗi 2 giây
  if (Firebase.ready() && (millis() - lastSensorSend > 2000)) {
    lastSensorSend = millis();

    FirebaseJson sensorJson;
    sensorJson.set("TEMP", g_temp);
    sensorJson.set("HUMI", g_humi);
    sensorJson.set("RAIN", g_isRaining);
    sensorJson.set("timestamp", millis());

    Firebase.updateNode(fbdo, "/SENSOR", sensorJson);
  }

  delay(100);
}
