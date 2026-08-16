# 🏠 Full-Stack IoT Smart Home System

![React Native](https://img.shields.io/badge/App-React_Native-61DAFB.svg?style=for-the-badge&logo=react&logoColor=black)
![Microcontroller](https://img.shields.io/badge/MCU-ESP32-E7352C.svg?style=for-the-badge&logo=espressif&logoColor=white)
![Backend](https://img.shields.io/badge/Backend-Firebase-FFCA28.svg?style=for-the-badge&logo=firebase&logoColor=black)
![Language](https://img.shields.io/badge/Language-C++-00599C.svg?style=for-the-badge&logo=cplusplus&logoColor=white)

## 📌 Overview

A comprehensive Internet of Things (IoT) Smart Home automation system. This project features a custom-built mobile application (React Native) that communicates with an ESP32 microcontroller via Firebase Realtime Database. Users can remotely monitor home environmental conditions (temperature, humidity, rain) and control home appliances (doors, automatic shelters, lights, and fans) in real-time.

---

## ✨ Key Features

### 📱 Mobile Application (React Native)

- **User Authentication**: Secure Login & Registration powered by Firebase Auth.
- **Real-time Control & Monitoring**: Toggle appliances and read sensor data with near-zero latency.
- **Smart UI/UX**: Includes a dark/light mode toggle and an intuitive dashboard for room & device management.
- **Activity Logs**: Tracks and displays the real-time history of device interactions.

### ⚙️ Hardware Integration (ESP32)

- **Climate Monitoring**: Reads real-time ambient temperature and humidity via the DHT11 sensor.
- **Weather Automation**: Detects rain and automatically triggers the shelter servo mechanism.
- **Access Control**: Actuates servo motors to simulate main door locking/unlocking.
- **Bi-directional Sync**: Constantly listens to Firebase streams to synchronize hardware states with mobile app inputs.

---

## 🛠️ Tech Stack

- **Frontend**: React Native, JavaScript / TypeScript
- **Backend**: Firebase (Authentication, Realtime Database)
- **Hardware/Firmware**: ESP32, C++ (Arduino Framework), `FirebaseESP32`, `DHT`, `ESP32Servo`

---

## 🔌 Hardware Pin Mapping (ESP32)

| Component         | ESP32 Pin | Type / Protocol | Function                               |
| :---------------- | :-------: | :-------------: | :------------------------------------- |
| **DHT11**         | `GPIO 21` |  Digital Input  | Temperature & Humidity Sensor          |
| **Rain Sensor**   | `GPIO 36` |  Digital Input  | Rain detection (`LOW` = Rain detected) |
| **Shelter Servo** | `GPIO 14` |   PWM Output    | Controls the automated roof/shelter    |
| **Door Servo**    | `GPIO 27` |   PWM Output    | Controls the main door lock            |

---

## 🚀 Getting Started

### Prerequisites

1. **Node.js** (>= 16.x) & React Native development environment.
2. **Arduino IDE** or **PlatformIO** with ESP32 board support installed.
3. A **Firebase Project** with _Realtime Database_ and _Authentication_ enabled.

### Setup Instructions

#### 1. Clone the repository

```bash
git clone [https://github.com/triet35/SmartHome-IoT.git](https://github.com/triet335/SmartHome-IoT.git)
cd SmartHome-IoT
```

#### 2. Mobile App Setup

# Navigate to the mobile app directory
```bash
cd MobileApp
```
# Install dependencies
```bash
npm install
```
# Add your google-services.json to android/app/ (for Android)

# Run on Android / iOS
```bash
npx react-native run-android
```
#### 3. Firmware Setup

3.1 Open the /Firmware directory in Arduino IDE.

3.2 Install required libraries via Library Manager: Firebase ESP32 Client, DHT sensor library, ESP32Servo.

3.3 Update your Wi-Fi credentials and Firebase config in the code:
```bash
#define WIFI_SSID "YOUR_WIFI_NAME"
#define WIFI_PASSWORD "YOUR_WIFI_PASSWORD"
#define API_KEY "YOUR_FIREBASE_API_KEY"
#define DATABASE_URL "YOUR_FIREBASE_DATABASE_URL"
```
3.4 Connect your ESP32 board and click Upload.
#
