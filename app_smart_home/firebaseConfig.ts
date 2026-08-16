import { initializeApp } from 'firebase/app';
import { getDatabase } from 'firebase/database';
// Lưu ý: Auth dùng @react-native-firebase/auth nên không cần init ở đây, 
// nhưng nếu bạn dùng JS SDK cho Auth thì import getAuth

const firebaseConfig = {
  apiKey: "AIzaSyA5f3SCxNtyTLVLWCBAr6Y4lX8jq-VfWYY",
  authDomain: "smarthome-d0827.firebaseapp.com", // Tự động suy ra từ project_id
  databaseURL: "https://smarthome-d0827-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "smarthome-d0827",
  storageBucket: "smarthome-d0827.firebasestorage.app",
  messagingSenderId: "329366095344",
  appId: "1:329366095344:android:2b1bc47da7d88205bcc935"
};

// Khởi tạo Firebase App (cho JS SDK)
const app = initializeApp(firebaseConfig);

// Khởi tạo Realtime Database
const db = getDatabase(app);

export { db, app };