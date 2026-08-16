/**
 * ========================================================================================
 * SMART HOME APP - ỨNG DỤNG ĐIỀU KHIỂN VÀ GIÁM SÁT NHÀ THÔNG MINH
 * ========================================================================================
 * 
 * Ứng dụng React Native điều khiển các thiết bị trong nhà thông minh qua ESP32
 * Sử dụng Firebase Realtime Database để đồng bộ dữ liệu realtime
 * 
 * Chức năng chính:
 * - Đăng nhập/Đăng ký với Firebase Authentication
 * - Quản lý phòng và thiết bị (đèn, quạt)
 * - Điều khiển cửa chính và mái che
 * - Hiển thị dữ liệu cảm biến (nhiệt độ, độ ẩm, mưa)
 * - Lịch sử hoạt động
 * - Trang cá nhân người dùng
 * - Chế độ sáng/tối
 * 
 * ========================================================================================
 */

// ========================================================================================
// IMPORTS - CÁC THƯ VIỆN VÀ COMPONENT
// ========================================================================================

import React, {
  useState,      
  useContext,   
  createContext,  
  useEffect,     
  useLayoutEffect,
  useCallback,    
} from 'react';

import {
  View,                 
  Text,                  
  TextInput,            
  TouchableOpacity,      
  FlatList,               
  StyleSheet,          
  Switch,           
  Alert,            
  StatusBar,    
  useColorScheme,         // Lấy chế độ sáng/tối của hệ thống
  ActivityIndicator,      // Hiển thị vòng xoay loading
  ScrollView,        
  Modal,              
  TextProps,          
  Image,             
  Linking,                // Mở URL/Email/Phone
  KeyboardAvoidingView,   // Tự động điều chỉnh khi mở bàn phím
} from 'react-native';

// React Navigation - Điều hướng giữa các màn hình
import {
  NavigationContainer,    
  DefaultTheme,           // Theme mặc định (sáng)
  DarkTheme,              // Theme tối
  Theme as NavigationTheme,
} from '@react-navigation/native';

// Bottom Tab Navigator - Thanh điều hướng dưới cùng
import {
  createBottomTabNavigator,    // Tạo tab navigator
  BottomTabScreenProps,         // Type cho tab screen props
} from '@react-navigation/bottom-tabs';

// Stack Navigator - Điều hướng dạng stack (push/pop)
import {
  createNativeStackNavigator,  // Tạo stack navigator
  NativeStackScreenProps,      // Type cho stack screen props
} from '@react-navigation/native-stack';

// --- ICONS ---
// Cấu hình Ionicons từ react-native-vector-icons
type IoniconProps = TextProps & { name: string; size?: number; color?: string };
type IoniconComponent = React.ComponentType<IoniconProps>;
const IoniconsModule = require('react-native-vector-icons/Ionicons');
const Ionicons: IoniconComponent = IoniconsModule.default || IoniconsModule;

// --- FIREBASE IMPORTS (REALTIME DATABASE ONLY) ---
// Firebase Realtime Database functions
import { 
  ref,              // Tạo reference đến node trong database
  set,              // Ghi dữ liệu (ghi đè)
  update,           // Cập nhật dữ liệu
  remove,           // Xóa dữ liệu
  onValue,          // Lắng nghe thay đổi realtime
  query,            // Tạo query để filter/sort
  limitToLast,      // Giới hạn số lượng kết quả (lấy N mục cuối)
  serverTimestamp,  // Timestamp từ server
  get,              // Đọc dữ liệu một lần (không lắng nghe)
} from 'firebase/database';
import { db } from './firebaseConfig'; // Database instance từ firebaseConfig
import auth, { FirebaseAuthTypes } from '@react-native-firebase/auth'; // Firebase Authentication

// ========================================================================================
// DATA MODELS - ĐỊNH NGHĨA CÁC KIỂU DỮ LIỆU
// ========================================================================================

/**
 * ThemeColors - Cấu hình màu sắc cho ứng dụng
 * Hỗ trợ cả chế độ sáng và tối
 */
interface ThemeColors {
  primary: string;       // Màu chính (nút, header)
  background: string;    // Màu nền
  card: string;          // Màu nền card/modal
  text: string;          // Màu chữ chính
  subText: string;       // Màu chữ phụ
  border: string;        // Màu viền
  danger: string;        // Màu cảnh báo/lỗi
  success: string;       // Màu thành công
}

/**
 * ThemeContextType - Context cho theme (sáng/tối)
 */
export interface ThemeContextType {
  isDarkMode: boolean;                      // Trạng thái chế độ tối
  setIsDarkMode: (value: boolean) => void;  // Hàm thay đổi chế độ tối
  theme: ThemeColors;                       // Object chứa các màu hiện tại
  navTheme: NavigationTheme;                // Theme cho navigation
}

/**
 * AuthUser - Thông tin người dùng đã đăng nhập
 */
interface AuthUser {
  uid: string;            // User ID từ Firebase
  email: string | null;   // Email người dùng
}

/**
 * AuthContextType - Context cho authentication
 */
export interface AuthContextType {
  user: AuthUser | null;                                      // Thông tin user hiện tại (null nếu chưa đăng nhập)
  login: (email: string, password: string) => Promise<void>;  // Hàm đăng nhập
  logout: () => Promise<void>;                                // Hàm đăng xuất
}

/**
 * Device - Thiết bị trong phòng (đèn hoặc quạt)
 */
interface Device {
  id: string;                    // ID thiết bị
  name: string;                  // Tên thiết bị
  type: 'light' | 'fan';         // Loại thiết bị: đèn hoặc quạt
  pin: number;                   // Chân GPIO trên ESP32
  state: boolean;                // Trạng thái: bật (true) hoặc tắt (false)
}

/**
 * Room - Phòng trong nhà
 */
interface Room {
  id: string;        // ID phòng
  name: string;      // Tên phòng
  devices: Device[]; // Danh sách thiết bị trong phòng
}

/**
 * HistoryItem - Mục lịch sử hoạt động
 */
interface HistoryItem {
  id: string;         // ID mục lịch sử
  content: string;    // Nội dung hoạt động
  time: string;       // Thời gian hiển thị (đã format)
  timestamp: number;  // Timestamp dạng số (epoch milliseconds) để sắp xếp
}

/**
 * SensorsData - Dữ liệu từ cảm biến ESP32
 */
interface SensorsData {
  temperature: number | null; // Nhiệt độ (°C)
  humidity: number | null;    // Độ ẩm (%)
  isRaining: boolean;         // Có mưa hay không
}

/**
 * AppContextType - Context chính cho ứng dụng
 * Chứa tất cả dữ liệu và hàm xử lý cho phòng, thiết bị, cảm biến, cửa, mái che
 */
export interface AppContextType {
  // Dữ liệu
  rooms: Room[];                     // Danh sách phòng
  history: HistoryItem[];            // Lịch sử hoạt động
  sensorsData: SensorsData;          // Dữ liệu cảm biến
  shelterState: boolean;             // Trạng thái mái che (mở/đóng)
  shelterOverride: boolean;          // Máy che đang ở chế độ thủ công hay tự động
  mainDoorOpen: boolean;             // Trạng thái cửa chính (mở/đóng)
  
  // CRUD Phòng
  addRoom: (name: string) => Promise<void>;
  deleteRoom: (roomId: string, roomName: string) => Promise<void>;
  
  // CRUD Thiết bị
  addDevice: (
    roomId: string,
    name: string,
    pin: number,
    type?: 'light' | 'fan',
  ) => Promise<void>;
  deleteDevice: (
    roomId: string,
    deviceId: string,
    deviceName: string,
    roomName: string,
  ) => Promise<void>;
  toggleDevice: (
    roomId: string,
    deviceId: string,
    deviceName: string,
    roomName: string,
    currentState: boolean,
  ) => Promise<void>;
  
  // Giao tiếp ESP32 
  fetchSensorDataFromESP32: () => Promise<void>;
  sendCommandToESP32: (
    deviceId: string,
    command: string,
    value: any,
  ) => Promise<boolean>;
  
  // Điều khiển mái che
  controlShelter: (state: boolean) => Promise<void>;  // Điều khiển thủ công
  enableShelterAuto: () => Promise<void>;              // Bật chế độ tự động
  
  // Điều khiển cửa chính
  controlMainDoor: (state: boolean) => Promise<void>;
}

// ========================================================================================
// NAVIGATION TYPES - ĐỊNH NGHĨA CÁC MÀN HÌNH VÀ PARAMS
// ========================================================================================

/**
 * RootStackParamList - Các màn hình trong Stack Navigator
 * Stack Navigator dùng cho HomeScreen và RoomDetail
 */
export type RootStackParamList = {
  HomeScreen: undefined;                    // Màn hình chủ, không có params
  RoomDetail: { roomId: string; title: string }; // Màn hình chi tiết phòng, cần roomId và title
};

/**
 * RootTabParamList - Các tab trong Bottom Tab Navigator
 * Tab Navigator có 3 tab: Home, History, Profile
 */
export type RootTabParamList = {
  Home: undefined;      // Tab Trang chủ
  History: undefined;   // Tab Lịch sử
  Profile: undefined;   // Tab Cá nhân
};

declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList, RootTabParamList {}
  }
}

type HomeScreenNavigationProp = NativeStackScreenProps<RootStackParamList, 'HomeScreen'>;
type RoomDetailScreenNavigationProp = NativeStackScreenProps<RootStackParamList, 'RoomDetail'>;
type TabBarScreenProps<RouteName extends keyof RootTabParamList> = BottomTabScreenProps<RootTabParamList, RouteName>;

// ========================================================================================
// THỰC THI
// ========================================================================================

// ========================================================================================
// THEME CONFIGURATION - CẤU HÌNH MÀU SẮC
// ========================================================================================

/**
 * lightColors - Bảng màu cho chế độ sáng
 */
const lightColors: ThemeColors = {
  primary: '#007AFF',      // Xanh dương
  background: '#F2F2F7',    // Xám nhạt
  card: '#FFFFFF',          // Trắng
  text: '#000000',          // Đen
  subText: '#8E8E93',       // Xám
  border: '#C6C6C8',        // Xám viền
  danger: '#FF3B30',        // Đỏ
  success: '#34C759',       // Xanh lá
};

/**
 * darkColors - Bảng màu cho chế độ tối
 */
const darkColors: ThemeColors = {
  primary: '#0A84FF',       // Xanh dương sáng hơn
  background: '#000000',    // Đen
  card: '#1C1C1E',          // Xám đen
  text: '#FFFFFF',          // Trắng
  subText: '#8E8E93',       // Xám (giữ nguyên)
  border: '#38383A',        // Xám đậm
  danger: '#FF453A',        // Đỏ sáng hơn
  success: '#30D158',       // Xanh lá sáng hơn
};

// ========================================================================================
// CONTEXT CREATION - TẠO CÁC CONTEXT ĐỂ CHIA SẺ DỮ LIỆU
// ========================================================================================

/**
 * AuthContext - Context cho authentication
 */
const defaultAuthContext: AuthContextType = {
  user: null,
  login: async () => {},
  logout: async () => {},
};
const AuthContext = createContext<AuthContextType>(defaultAuthContext);

/**
 * AppContext - Context chính cho ứng dụng
 * Chứa tất cả dữ liệu và hàm xử lý
 */
const defaultAppContext: AppContextType = {
  rooms: [],
  history: [],
  sensorsData: { temperature: null, humidity: null, isRaining: false },
  shelterState: false,
  shelterOverride: false,
  mainDoorOpen: false,
  addRoom: async () => {},
  deleteRoom: async () => {},
  addDevice: async () => {},
  deleteDevice: async () => {},
  toggleDevice: async () => {},
  fetchSensorDataFromESP32: async () => {},
  sendCommandToESP32: async () => true,
  controlShelter: async () => {},
  enableShelterAuto: async () => {},
  controlMainDoor: async () => {},
};
const AppContext = createContext<AppContextType>(defaultAppContext);

/**
 * ThemeContext - Context cho theme (sáng/tối)
 */
const defaultThemeContext: ThemeContextType = {
  isDarkMode: false,
  setIsDarkMode: () => {},
  theme: lightColors,
  navTheme: DefaultTheme,
};
const ThemeContext = createContext<ThemeContextType>(defaultThemeContext);

// ========================================================================================
// PROVIDERS - CÁC COMPONENT CUNG CẤP DỮ LIỆU CHO TOÀN BỘ APP
// ========================================================================================

/**
 * ThemeProvider - Provider cho theme (sáng/tối)
 * Tự động theo dõi chế độ sáng/tối của hệ thống và cho phép người dùng thay đổi
 */
const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const systemScheme = useColorScheme(); // Lấy chế độ sáng/tối từ hệ thống
  const [isDarkMode, setIsDarkMode] = useState<boolean>(systemScheme === 'dark');
  const theme: ThemeColors = isDarkMode ? darkColors : lightColors;
  const navTheme: NavigationTheme = isDarkMode ? DarkTheme : DefaultTheme;

  // Đồng bộ màu navigation với theme
  navTheme.colors.background = theme.background;
  navTheme.colors.card = theme.card;
  navTheme.colors.text = theme.text;
  navTheme.colors.border = theme.border;
  navTheme.colors.primary = theme.primary;

  return (
    <ThemeContext.Provider value={{ isDarkMode, setIsDarkMode, theme, navTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

/**
 * getAuthErrorMessage - Chuyển đổi mã lỗi Firebase thành thông báo tiếng Việt
 * @param error - Lỗi từ Firebase Authentication
 * @returns Thông báo lỗi bằng tiếng Việt
 */
const getAuthErrorMessage = (error?: FirebaseAuthTypes.NativeFirebaseAuthError | null): string => {
  if (!error) return 'Đã xảy ra lỗi, vui lòng thử lại.';
  switch (error.code) {
    case 'auth/email-already-in-use': return 'Email đã được sử dụng.';
    case 'auth/invalid-email': return 'Email không hợp lệ.';
    case 'auth/weak-password': return 'Mật khẩu phải có ít nhất 6 ký tự.';
    case 'auth/user-not-found':
    case 'auth/wrong-password': return 'Email hoặc mật khẩu không đúng.';
    default: return 'Đã xảy ra lỗi, vui lòng thử lại.';
  }
};

/**
 * AuthProvider - Provider cho authentication
 * Quản lý trạng thái đăng nhập/đăng xuất và lắng nghe thay đổi từ Firebase Auth
 */
const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState<boolean>(true); // Loading khi kiểm tra trạng thái đăng nhập

  // Lắng nghe thay đổi trạng thái đăng nhập từ Firebase
  useEffect(() => {
    const subscriber = auth().onAuthStateChanged(_user => {
      // Cập nhật user state khi có thay đổi
      setUser(_user ? { uid: _user.uid, email: _user.email } : null);
      if (loading) setLoading(false); // Tắt loading sau lần đầu tiên
    });
      return subscriber; // Hủy lắng nghe khi component unmount 
  }, []);

  /**
   * login - Đăng nhập với email và password
   * @param email - Email người dùng
   * @param password - Mật khẩu
   */
  const login = async (email: string, password: string): Promise<void> => {
    try {
      setLoading(true);
      await auth().signInWithEmailAndPassword(email, password);
      // onAuthStateChanged sẽ tự động cập nhật user state
    } catch (error: any) {
      const message = getAuthErrorMessage(error);
      Alert.alert('Lỗi đăng nhập', message);
    } finally {
      setLoading(false);
    }
  };

  /**
   * logout - Đăng xuất khỏi tài khoản
   */
  const logout = async (): Promise<void> => {
    try {
      await auth().signOut();
      // onAuthStateChanged sẽ tự động set user = null
    } catch (error: any) {
      Alert.alert('Lỗi đăng xuất', error.message);
    }
  };

  // Hiển thị loading khi đang kiểm tra trạng thái đăng nhập
  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
        <Text>Đang tải...</Text>
      </View>
    );
  }

  return (
    <AuthContext.Provider value={{ user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

/**
 * AppProvider - Provider chính cho ứng dụng
 * Quản lý tất cả dữ liệu: phòng, thiết bị, cảm biến, cửa, mái che
 * Sử dụng Firebase Realtime Database để đồng bộ dữ liệu realtime
 */
const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useContext(AuthContext);
  
  // State quản lý dữ liệu
  const [rooms, setRooms] = useState<Room[]>([]);                    // Danh sách phòng
  const [history, setHistory] = useState<HistoryItem[]>([]);         // Lịch sử hoạt động
  const [sensorsData, setSensorsData] = useState<SensorsData>({      // Dữ liệu cảm biến
    temperature: null,
    humidity: null,
    isRaining: false,
  });
  const [shelterState, setShelterState] = useState<boolean>(false);        // Trạng thái mái che
  const [shelterOverride, setShelterOverride] = useState<boolean>(false);  // Máy che thủ công hay tự động
  const [mainDoorOpen, setMainDoorOpen] = useState<boolean>(false);        // Trạng thái cửa chính

  // ====================== CẤU HÌNH NGÔI NHÀ DÙNG CHUNG =======================
  /**
   * Dữ liệu được lưu ngay dưới root của Realtime Database:
   *  - /rooms   : danh sách phòng + thiết bị
   *  - /history : lịch sử hoạt động
   *  - /SENSOR  : dữ liệu cảm biến từ ESP32
   *  - /controls/shelter : điều khiển mái che
   *  - /controls/mainDoor : điều khiển cửa chính
   * ESP32 đọc trực tiếp từ các node này để điều khiển thiết bị
   */
  const GLOBAL_ROOMS_PATH = 'rooms';                     // Đường dẫn đến danh sách phòng
  const GLOBAL_HISTORY_PATH = 'history';                 // Đường dẫn đến lịch sử
  const GLOBAL_MAIN_DOOR_PATH = 'controls/mainDoor';     // Đường dẫn đến cửa chính

  /**
   * getNextNumericKey - Tạo ID tăng dần dạng số (1, 2, 3, ...)
   * Không dùng push ID hay timestamp để dễ đọc và quản lý
   * @param path - Đường dẫn trong database cần tạo key
   * @returns ID mới dạng string
   */
  const getNextNumericKey = async (path: string): Promise<string> => {
    const snapshot = await get(ref(db, path));
    let next = 1;
    if (snapshot.exists()) {
      const data = snapshot.val();
      // Tìm số lớn nhất và +1
      Object.keys(data).forEach(key => {
        const num = parseInt(key, 10);
        if (!Number.isNaN(num) && num >= next) {
          next = num + 1;
        }
      });
    }
    return String(next);
  };

  // Hàm lấy ID tiếp theo cho phòng, lịch sử, thiết bị
  const getNextRoomId = () => getNextNumericKey(GLOBAL_ROOMS_PATH);
  const getNextHistoryId = () => getNextNumericKey(GLOBAL_HISTORY_PATH);
  const getNextDeviceId = (roomId: string) =>
    getNextNumericKey(`${GLOBAL_ROOMS_PATH}/${roomId}/devices`);

  /**
   * logHistory - Ghi lịch sử hoạt động vào Firebase
   * @param content - Nội dung hoạt động cần ghi
   */
  const logHistory = useCallback(async (content: string): Promise<void> => {
    if (!user) return; // Yêu cầu đăng nhập nhưng không dùng user.uid trong đường dẫn
    const id = await getNextHistoryId();
    const historyRef = ref(db, `${GLOBAL_HISTORY_PATH}/${id}`);
    await set(historyRef, {
      content,
      timestamp: Date.now(), // Timestamp dạng số để sắp xếp
    });
  }, [user]);

  // ========================================================================================
  // REALTIME LISTENERS - LẮNG NGHE THAY ĐỔI TỪ FIREBASE REALTIME
  // ========================================================================================

  /**
   * useEffect: Lắng nghe thay đổi danh sách phòng và thiết bị từ Firebase
   * Tự động cập nhật khi có thay đổi (thêm, xóa, sửa phòng/thiết bị)
   */
  useEffect(() => {
    if (!user) {
      setRooms([]); // Xóa dữ liệu khi chưa đăng nhập
      return;
    }

    // Đọc Rooms của NGÔI NHÀ DÙNG CHUNG (không còn tách theo user.uid)
    const roomsRef = ref(db, GLOBAL_ROOMS_PATH);
    
    // Lắng nghe sự thay đổi của Rooms (realtime)
    const unsubscribe = onValue(roomsRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        // Chuyển đổi Object sang Array cho FlatList
        const fetchedRooms: Room[] = Object.keys(data).map((key) => {
            const roomData = data[key];
            
            // Xử lý devices (cũng là object trong RTDB)
            const devicesObj = roomData.devices || {};
            const devicesArray: Device[] = Object.keys(devicesObj).map(dKey => ({
                id: dKey,
                ...devicesObj[dKey]
            }));

            return {
                id: key,
                name: roomData.name,
                devices: devicesArray
            };
        });
        setRooms(fetchedRooms);
      } else {
        setRooms([]);
      }
    }, (error) => {
        console.error("Lỗi đọc phòng:", error);
    });

    return () => unsubscribe();
  }, [user]);

  /**
   * useEffect: Lắng nghe thay đổi lịch sử hoạt động từ Firebase
   * Chỉ lấy 20 mục mới nhất
   */
  useEffect(() => {
    if (!user) {
      setHistory([]);
      return;
    }
    
    // Lấy 20 mục lịch sử mới nhất
    // Do RTDB sắp xếp tăng dần, nên cần đảo ngược mảng ở client để hiện mới nhất lên đầu
    const historyQuery = query(ref(db, GLOBAL_HISTORY_PATH), limitToLast(20));

    const unsubscribe = onValue(historyQuery, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        const fetchedHistory: HistoryItem[] = Object.keys(data).map(key => ({
            id: key,
            content: data[key].content,
            timestamp: data[key].timestamp,
            time: new Date(data[key].timestamp).toLocaleString(),
        }));
        
        // Sắp xếp giảm dần (Mới nhất lên đầu)
        fetchedHistory.sort((a, b) => b.timestamp - a.timestamp);
        
        setHistory(fetchedHistory);
      } else {
        setHistory([]);
      }
    }, (error) => {
        console.error("Lỗi đọc lịch sử:", error);
    });

    return () => unsubscribe();
  }, [user]);

  // ========================================================================================
  // ESP32 COMMUNICATION - GIAO TIẾP VỚI ESP32 QUA FIREBASE
  // ========================================================================================

  /**
   * sendCommandToESP32 - Gửi lệnh đến ESP32 (mock function)
   * ESP32 lắng nghe trực tiếp từ Firebase node /rooms/.../devices/.../state
   */
  const sendCommandToESP32 = useCallback(
    async (deviceId: string, command: string, value: any): Promise<boolean> => {
      console.log(`[ESP32] Command: device=${deviceId}, cmd=${command}, value=${value}`);
      return true;
    },
    [],
  );

  /**
   * fetchSensorDataFromESP32 - Fetch dữ liệu cảm biến một lần (mock function)
   * App lắng nghe realtime bằng onValue ở useEffect
   */
  const fetchSensorDataFromESP32 = useCallback(async (): Promise<void> => {
    // Nếu cần fetch 1 lần, có thể dùng: await get(ref(db, 'SENSOR'))
  }, []);

  /**
   * controlShelter - Điều khiển mái che ở chế độ thủ công
   * @param state - true = mở, false = đóng
   */
  const controlShelter = useCallback(async (state: boolean): Promise<void> => {
      if (!user) {
        Alert.alert('Lỗi', 'Chưa đăng nhập');
        return;
      }
      try {
        // Ghi lệnh override mái che lên Firebase: /controls/shelter { override: true, state }
        const shelterRef = ref(db, 'controls/shelter');
        await set(shelterRef, {
          override: true,  // Đánh dấu đang ở chế độ thủ công
          state,
          updatedAt: Date.now(),
        });

        setShelterOverride(true);
        setShelterState(state);
        Alert.alert('Mái che', `Đã ${state ? 'mở' : 'đóng'} mái che.`);
        await logHistory(`${state ? 'Mở' : 'Đóng'} mái che`);
      } catch (error: any) {
        console.error('Lỗi điều khiển mái che:', error);
        Alert.alert('Lỗi', 'Không thể điều khiển mái che: ' + error.message);
      }
    },
    [user, logHistory],
  );

  /**
   * enableShelterAuto - Bật chế độ tự động cho mái che
   * Máy che sẽ tự động mở khi có mưa, đóng khi không mưa
   */
  const enableShelterAuto = useCallback(async (): Promise<void> => {
      if (!user) {
        Alert.alert('Lỗi', 'Chưa đăng nhập');
        return;
      }
      try {
        const shelterRef = ref(db, 'controls/shelter');
        await set(shelterRef, {
          override: false, // Đánh dấu đang ở chế độ tự động
          updatedAt: Date.now(),
        });

        setShelterOverride(false);
        setShelterState(sensorsData.isRaining); // Đồng bộ với trạng thái mưa hiện tại
        Alert.alert('Mái che', 'Đã bật chế độ tự động mái che.');
        await logHistory('Bật chế độ tự động mái che');
      } catch (error: any) {
        console.error('Lỗi bật chế độ tự động mái che:', error);
        Alert.alert('Lỗi', 'Không thể bật chế độ tự động mái che: ' + error.message);
      }
    },
    [user, logHistory, sensorsData.isRaining],
  );

  /**
   * controlMainDoor - Điều khiển cửa chính
   * @param state - true = mở, false = đóng
   */
  const controlMainDoor = useCallback(async (state: boolean): Promise<void> => {
      if (!user) {
        Alert.alert('Lỗi', 'Chưa đăng nhập');
        return;
      }
      try {
        // Gửi trạng thái cửa chính lên Firebase để ESP32 đọc tại /controls/mainDoor
        const doorRef = ref(db, GLOBAL_MAIN_DOOR_PATH);
        await set(doorRef, state);

        setMainDoorOpen(state);
        Alert.alert('Cửa chính', `Đã ${state ? 'mở' : 'đóng'} cửa chính.`);
        await logHistory(`${state ? 'Mở' : 'Đóng'} cửa chính`);
      } catch (error: any) {
        console.error('Lỗi điều khiển cửa chính:', error);
        Alert.alert('Lỗi', 'Không thể điều khiển cửa chính: ' + error.message);
      }
    },
    [user, logHistory],
  );

  /**
   * useEffect: Lắng nghe dữ liệu cảm biến từ ESP32
   * ESP32 gửi dữ liệu lên node /SENSOR với format: { TEMP: number, HUMI: number, RAIN: boolean }
   */
  useEffect(() => {
    const sensorRef = ref(db, 'SENSOR');
    const unsubscribe = onValue(
      sensorRef,
      snapshot => {
        if (!snapshot.exists()) {
          setSensorsData({ temperature: null, humidity: null, isRaining: false });
          return;
        }
        const data = snapshot.val() as any;
        setSensorsData({
          temperature: typeof data.TEMP === 'number' ? data.TEMP : null,
          humidity: typeof data.HUMI === 'number' ? data.HUMI : null,
          isRaining: !!data.RAIN,
        });
      },
      error => {
        console.error('Lỗi đọc SENSOR từ Firebase:', error);
      },
    );

    return () => unsubscribe();
  }, []);

  /**
   * useEffect: Lắng nghe trạng thái override mái che từ Firebase để đồng bộ
   * Đảm bảo UI luôn hiển thị đúng trạng thái mái che
   */
  useEffect(() => {
    const shelterRef = ref(db, 'controls/shelter');
    const unsubscribe = onValue(
      shelterRef,
      snapshot => {
        if (snapshot.exists()) {
          const data = snapshot.val();
          const override = !!data.override;
          setShelterOverride(override);
          if (override) {
            // Nếu đang override (thủ công), dùng trạng thái từ Firebase
            setShelterState(!!data.state);
          }
        } else {
          // Nếu chưa có dữ liệu, mặc định là chế độ tự động
          setShelterOverride(false);
        }
      },
      error => {
        console.error('Lỗi đọc controls/shelter từ Firebase:', error);
      },
    );

    return () => unsubscribe();
  }, []);

  /**
   * useEffect: Đồng bộ mái che theo cảm biến mưa khi ở chế độ tự động
   * Logic: Nếu không override -> tự động mở khi có mưa, đóng khi không mưa
   * Ghi trạng thái lên Firebase để ESP32 đọc và điều khiển
   */
  useEffect(() => {
    if (!shelterOverride && sensorsData.isRaining !== null) {
      const newState = sensorsData.isRaining; // Mở khi có mưa
      // Cập nhật trạng thái local
      setShelterState(newState);
      // Ghi trạng thái tự động lên Firebase để ESP32 đọc
      const shelterRef = ref(db, 'controls/shelter');
      set(shelterRef, {
        override: false,
        state: newState,
        updatedAt: Date.now(),
      }).catch(error => {
        console.error('Lỗi ghi trạng thái tự động mái che:', error);
      });
    }
  }, [sensorsData.isRaining, shelterOverride]);

  // ========================================================================================
  // CRUD FUNCTIONS - CÁC HÀM THÊM, SỬA, XÓA DỮ LIỆU
  // ========================================================================================

  /**
   * addRoom - Thêm phòng mới vào database
   * @param name - Tên phòng
   */
  const addRoom = async (name: string): Promise<void> => {
    if (!name.trim()) {
        Alert.alert('Lỗi', 'Tên phòng không được để trống');
        return;
    }
    // Kiểm tra đăng nhập
    if (!user) {
        Alert.alert('Lỗi', 'Chưa đăng nhập');
        return;
    }

    try {
        console.log('Đang tạo phòng dùng chung:', name);
        
        // 1. Tạo id phòng tăng dần: 1, 2, 3, ...
        const roomId = await getNextRoomId();

        // 2. Ghi dữ liệu trực tiếp với id này
        const roomRef = ref(db, `${GLOBAL_ROOMS_PATH}/${roomId}`);
        await set(roomRef, {
            name: name.trim(),
            createdAt: serverTimestamp(), 
        });

        console.log('Đã tạo phòng thành công');
        logHistory(`Thêm phòng "${name}"`);
        
        // Đóng modal nếu đang mở
    } catch (error: any) {
        console.error('Lỗi addRoom:', error);
        Alert.alert('Lỗi tạo phòng', error.message);
    }
  };

  /**
   * deleteRoom - Xóa phòng khỏi database
   * @param roomId - ID phòng cần xóa
   * @param roomName - Tên phòng (để ghi lịch sử)
   */
  const deleteRoom = async (roomId: string, roomName: string): Promise<void> => {
    if (!roomId || !user) return;
    try {
      const roomRef = ref(db, `${GLOBAL_ROOMS_PATH}/${roomId}`);
      await remove(roomRef);
      await logHistory(`Xóa phòng "${roomName}"`);
    } catch (error: any) {
      Alert.alert('Lỗi', 'Không thể xóa phòng: ' + error.message);
    }
  };

  /**
   * addDevice - Thêm thiết bị mới vào phòng
   * @param roomId - ID phòng
   * @param name - Tên thiết bị
   * @param pin - Chân GPIO trên ESP32
   * @param type - Loại thiết bị: 'light' (đèn) hoặc 'fan' (quạt), mặc định là 'light'
   */
  const addDevice = async (
    roomId: string,
    name: string,
    pin: number,
    type: 'light' | 'fan' = 'light',
  ): Promise<void> => {
    if (!name || !roomId || !user) return;
    try {
      
      
      // Thêm thiết bị vào bên trong node của phòng
      // Cấu trúc: /rooms/{roomId}/devices/{deviceId}, trong đó deviceId = 1, 2, 3, ...
      const deviceId = await getNextDeviceId(roomId);
      const deviceRef = ref(db, `${GLOBAL_ROOMS_PATH}/${roomId}/devices/${deviceId}`);
      await set(deviceRef, {
        name,
        type,
        pin: Number(pin),
        state: false,
      });

      await logHistory(`Thêm thiết bị "${name}" (GPIO ${pin})`);
    } catch (error: any) {
      Alert.alert('Lỗi', 'Không thể thêm thiết bị: ' + error.message);
    }
  };

  /**
   * deleteDevice - Xóa thiết bị khỏi phòng
   * @param roomId - ID phòng
   * @param deviceId - ID thiết bị
   * @param deviceName - Tên thiết bị (để ghi lịch sử)
   * @param roomName - Tên phòng (để ghi lịch sử)
   */
  const deleteDevice = async (
    roomId: string,
    deviceId: string,
    deviceName: string,
    roomName: string,
  ): Promise<void> => {
    if (!user) return;
    try {
      const devicePath = `${GLOBAL_ROOMS_PATH}/${roomId}/devices/${deviceId}`;
      await remove(ref(db, devicePath));
      await logHistory(`Xóa thiết bị "${deviceName}" tại ${roomName}`);
    } catch (error: any) {
      Alert.alert('Lỗi', 'Không thể xóa thiết bị: ' + error.message);
      console.error(error);
    }
  };

  /**
   * toggleDevice - Bật/tắt thiết bị
   * ESP32 sẽ tự động đọc trạng thái từ Firebase và điều khiển thiết bị
   * @param roomId - ID phòng
   * @param deviceId - ID thiết bị
   * @param deviceName - Tên thiết bị (để ghi lịch sử)
   * @param roomName - Tên phòng (để ghi lịch sử)
   * @param currentState - Trạng thái hiện tại của thiết bị
   */
  const toggleDevice = async (
    roomId: string,
    deviceId: string,
    deviceName: string,
    roomName: string,
    currentState: boolean,
  ): Promise<void> => {
    if (!user) return;
    const newState = !currentState;
    try {
      // Cập nhật trạng thái tại đúng đường dẫn của thiết bị
      const devicePath = `${GLOBAL_ROOMS_PATH}/${roomId}/devices/${deviceId}`;
      await update(ref(db, devicePath), {
        state: newState,
      });

      // Gửi lệnh ESP32 (mock - thực tế ESP32 đã lắng nghe trực tiếp từ Firebase)
      await sendCommandToESP32(deviceId, newState ? 'ON' : 'OFF', newState);

      await logHistory(`${newState ? 'Bật' : 'Tắt'} ${deviceName} tại ${roomName}`);
    } catch (error: any) {
      Alert.alert('Lỗi', 'Không thể cập nhật thiết bị: ' + error.message);
      console.error(error);
    }
  };

  return (
    <AppContext.Provider
      value={{
        rooms,
        history,
        sensorsData,
        shelterState,
        shelterOverride,
        mainDoorOpen,
        addRoom,
        deleteRoom,
        addDevice,
        deleteDevice,
        toggleDevice,
        fetchSensorDataFromESP32,
        sendCommandToESP32,
        controlShelter,
        enableShelterAuto,
        controlMainDoor,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

// ========================================================================================
// SCREENS - MÀN HÌNH CỦA ỨNG DỤNG
// ========================================================================================

/**
 * LoginScreen - Màn hình đăng nhập/đăng ký
 * Sử dụng Firebase Authentication để xác thực người dùng
 * Có KeyboardAvoidingView để tự động cuộn khi bàn phím mở
 */
const LoginScreen: React.FC = () => {
  const { login } = useContext(AuthContext);
  const { theme } = useContext(ThemeContext);
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');

  const register = async (): Promise<void> => {
    const trimmedEmail = email.trim();
    const trimmedPassword = password.trim();

    if (!trimmedEmail || !trimmedPassword) {
      Alert.alert('Lỗi đăng ký', 'Vui lòng nhập đầy đủ email và mật khẩu.');
      return;
    }

    if (trimmedPassword.length < 6) {
      Alert.alert('Lỗi đăng ký', 'Mật khẩu phải có ít nhất 6 ký tự.');
      return;
    }

    try {
      await auth().createUserWithEmailAndPassword(trimmedEmail, trimmedPassword);
      Alert.alert('Thành công', 'Tài khoản đã được tạo!');
    } catch (error: any) {
      const message = getAuthErrorMessage(error);
      Alert.alert('Lỗi đăng ký', message);
    }
  };

  return (
    <KeyboardAvoidingView 
      style={{ flex: 1 }}
      behavior="height"
      keyboardVerticalOffset={20}
    >
      {/* Background Gradient Effect */}
      <View style={[
        StyleSheet.absoluteFill,
        {
          backgroundColor: theme.background,
          opacity: 0.95,
        }
      ]} />
      <ScrollView 
        contentContainerStyle={[
          { 
            flexGrow: 1,
            justifyContent: 'center',
            alignItems: 'center',
            padding: 20,
          }
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Logo Icon */}
        <View style={[
          {
            width: 80,
            height: 80,
            borderRadius: 40,
            backgroundColor: theme.primary + '20',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 30,
            shadowColor: theme.primary,
            shadowOffset: { width: 0, height: 6 },
            shadowOpacity: 0.25,
            shadowRadius: 12,
            elevation: 6,
          }
        ]}>
          <Image
            source={require('./imgs/icon.png')}
            style={{ width: 60, height: 60, resizeMode: 'contain',borderRadius: 30}}
          />
        </View>
        
        <Text style={[
          styles.title, 
          { 
            color: theme.text,
            fontSize: 32,
            fontWeight: 'bold',
            marginBottom: 10,
          }
        ]}>
          Smart Home
        </Text>
        <Text style={{
          color: theme.subText,
          fontSize: 16,
          marginBottom: 40,
        }}>
          Điều khiển nhà thông minh của bạn
        </Text>

        <View style={{ width: '100%', maxWidth: 400 }}>
          <TextInput
            placeholder="Email"
            placeholderTextColor={theme.subText}
            style={[
              styles.input, 
              { 
                backgroundColor: theme.card, 
                color: theme.text, 
                borderColor: theme.border,
                marginBottom: 16,
              }
            ]}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
          />

          <TextInput
            placeholder="Mật khẩu"
            placeholderTextColor={theme.subText}
            style={[
              styles.input, 
              { 
                backgroundColor: theme.card, 
                color: theme.text, 
                borderColor: theme.border,
                marginBottom: 24,
              }
            ]}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />

          <TouchableOpacity 
            style={[
              styles.btn, 
              { 
                backgroundColor: theme.primary, 
                marginBottom: 12,
                shadowColor: theme.primary,
              }
            ]} 
            onPress={() => login(email, password)}
            activeOpacity={0.8}
          >
            <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 16 }}>ĐĂNG NHẬP</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[
              styles.btn, 
              { 
                backgroundColor: theme.subText,
                opacity: 0.8,
              }
            ]} 
            onPress={register}
            activeOpacity={0.8}
          >
            <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 16 }}>ĐĂNG KÝ</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

/**
 * HomeScreen - Màn hình trang chủ
 * Hiển thị:
 * - Dữ liệu cảm biến (nhiệt độ, độ ẩm, mưa)
 * - Điều khiển cửa chính và mái che
 * - Danh sách các phòng
 */
const HomeScreen: React.FC<HomeScreenNavigationProp> = ({ navigation }) => {
  const {
    rooms,
    sensorsData,
    shelterState,
    controlShelter,
    shelterOverride,
    enableShelterAuto,
    mainDoorOpen,
    controlMainDoor,
    addRoom,
    deleteRoom,
  } = useContext(AppContext);
  const { theme } = useContext(ThemeContext);
  const [isAddRoomVisible, setIsAddRoomVisible] = useState(false);
  const [newRoomName, setNewRoomName] = useState('');
  const [currentTime, setCurrentTime] = useState(new Date());

  // Cập nhật đồng hồ mỗi phút
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000); // Cập nhật mỗi giây để hiển thị giây chính xác

    return () => clearInterval(timer);
  }, []);

  // Chuyển đổi trạng thái mái che
  const toggleShelterMode = async () => {
    if (shelterOverride) {
      await enableShelterAuto();
    } else {
      await controlShelter(shelterState);
    }
  };

  // Xử lý thêm phòng
  const handleAddRoom = () => {
      setIsAddRoomVisible(true);
  };
  // Xác nhận thêm phòng
  const handleConfirmAddRoom = async () => {
    const name = newRoomName.trim();
    if (name) {
      await addRoom(name);
    } else {
      Alert.alert('Thông báo', 'Tên phòng không được bỏ trống.');
    }
    setNewRoomName('');
    setIsAddRoomVisible(false);
  };

  // Xác nhận xóa phòng
  const handleDeleteRoom = (roomId: string, roomName: string) => {
    Alert.alert('Xóa phòng', `Bạn có chắc muốn xóa "${roomName}"?`, [
      { text: 'Hủy', style: 'cancel' },
      { text: 'Xóa', style: 'destructive', onPress: () => deleteRoom(roomId, roomName) },
    ]);
  };

  // Render item phòng trong FlatList
  const renderRoomItem = ({ item }: { item: Room }) => (
    <View style={[styles.card, styles.roomCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <TouchableOpacity
        style={{ flex: 1 }}
        onPress={() => navigation.navigate('RoomDetail', { roomId: item.id, title: item.name })}
      >
        <Text style={[styles.cardTitle, { color: theme.text }]}>{item.name}</Text>
        <Text style={{ color: theme.subText }}>{item.devices.length} thiết bị</Text>
      </TouchableOpacity>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <TouchableOpacity onPress={() => handleDeleteRoom(item.id, item.name)} style={styles.iconButton}>
          <Ionicons name="trash" size={22} color={theme.danger} />
        </TouchableOpacity>
        <Ionicons name="chevron-forward" size={24} color={theme.subText} />
      </View>
    </View>
  );

  // Format ngày tháng năm
  const formatDate = (date: Date) => {
    const days = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
    const dayName = days[date.getDay()];
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    return `${dayName}, ${day}/${month}/${year}`;
  };

  // Format giờ phút giây
  const formatTime = (date: Date) => {
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const seconds = date.getSeconds().toString().padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <ScrollView style={{ flex: 1 }}>
        {/* ĐỒNG HỒ */}
        <View style={[styles.section, { borderBottomColor: 'transparent', paddingTop: 20 }]}>
          <View style={[
            styles.sensorCard,
            {
              backgroundColor: theme.card,
              borderColor: theme.border,
              padding: 16,
              alignItems: 'center',
            }
          ]}>
            <Ionicons name="time-outline" size={28} color={theme.primary} style={{ marginBottom: 8 }} />
            <Text style={{ color: theme.text, fontSize: 18, fontWeight: 'bold', marginBottom: 4 }}>
              {formatTime(currentTime)}
            </Text>
            <Text style={{ color: theme.subText, fontSize: 14 }}>
              {formatDate(currentTime)}
            </Text>
          </View>
        </View>

        {/* SECTION 1: ĐIỀU KHIỂN CHUNG (CỬA & MÁI CHE) - SIDE BY SIDE */}
        <View style={[styles.section, { borderBottomColor: 'transparent' }]}>
          <View style={[
            styles.sensorCard,
            {
              backgroundColor: theme.card,
              borderColor: theme.border,
            }
          ]}>
            {/* Header */}
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 15 }}>
              <View style={[styles.iconBadge, { backgroundColor: theme.success + '20', marginBottom: 0 }]}>
                <Ionicons name="settings-outline" size={20} color={theme.success}/>
              </View>
              <Text style={[styles.sectionTitle, { color: theme.text, marginLeft: 10, marginBottom: 0 }]}>Điều khiển</Text>
            </View>
            {/* Nội dung điều khiển */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                
                {/* BÊN TRÁI: CỬA CHÍNH */}
                <View style={{ flex: 1, marginRight: 8 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
                      <View style={[styles.iconBadge, { backgroundColor: theme.success + '20', width: 28, height: 28, marginBottom: 0 }]}>
                        <Ionicons name="key-outline" size={16} color={theme.success} />
                      </View>
                      <Text style={[styles.sectionTitle, { color: theme.text, fontSize: 16, marginBottom: 0, marginLeft: 8 }]}>Cửa chính</Text>
                    </View>
                    <View style={[
                        styles.doorCard, 
                        { 
                            backgroundColor: theme.background, 
                            borderColor: theme.border,
                            padding: 15,
                            height: 240,
                            justifyContent: 'space-between'
                        }
                    ]}>
                        <View style={{ alignItems: 'center' }}>
                            <Ionicons 
                                name={mainDoorOpen ? 'lock-open' : 'lock-closed'} 
                                size={40} 
                                color={mainDoorOpen ? theme.success : theme.subText} 
                            />
                            <Text style={[styles.doorTitle, { color: theme.text, fontSize: 16, textAlign: 'center', marginTop: 10 }]}>
                                Trạng thái : 

                                {mainDoorOpen ? ' Đang Mở' : ' Đang Đóng'}
                            </Text>
                        </View>
                        
                        <View style={{ alignItems: 'center', width: '100%' }}>
                            <View style={styles.switchContainer}>
                                <Switch 
                                    value={mainDoorOpen} 
                                    onValueChange={controlMainDoor} 
                                    trackColor={{ true: theme.primary, false: theme.subText }}
                                    thumbColor={mainDoorOpen ? '#fff' : '#f4f3f4'}
                                />
                            </View>
                        </View>
                    </View>
                </View>

                {/* BÊN PHẢI: MÁI CHE */}
                <View style={{ flex: 1, marginLeft: 8 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
                      <View style={[styles.iconBadge, { backgroundColor: theme.primary + '20', width: 28, height: 28, marginBottom: 0 }]}>
                        <Ionicons name="umbrella-outline" size={16} color={theme.primary} />
                      </View>
                      <Text style={[styles.sectionTitle, { color: theme.text, fontSize: 16, marginBottom: 0, marginLeft: 8 }]}>Mái che</Text>
                    </View>
                    <View style={[
                        styles.doorCard, 
                        { 
                            backgroundColor: theme.background, 
                            borderColor: theme.border,
                            padding: 15,
                            height: 240,
                            justifyContent: 'space-between'
                        }
                    ]}>
                         <View style={{ alignItems: 'center' }}>
                            <Ionicons 
                                name={shelterState ? 'umbrella' : 'umbrella-outline'} 
                                size={40} 
                                color={shelterState ? theme.success : theme.subText} 
                            />
                            <Text style={[styles.doorTitle, { color: theme.text, fontSize: 16, textAlign: 'center', marginTop: 10 }]}>
                                {shelterState ? 'Đang Mở' : 'Đang Đóng'}
                            </Text>
                            <Text style={{ color: theme.subText, fontSize: 11, textAlign: 'center' }}>
                                {shelterOverride ? '(Thủ công)' : '(Tự động)'}
                            </Text>
                        </View>

                        <View style={{ alignItems: 'center', width: '100%' }}>
                            <TouchableOpacity
                                style={{
                                    marginTop: 15,
                                    paddingHorizontal: 8,
                                    paddingVertical: 6,
                                    borderRadius: 6,
                                    backgroundColor: shelterOverride ? '#a09c9cff' : theme.primary,
                                    width: '100%',
                                    alignItems: 'center',
                                    marginBottom: 15
                                }}
                                onPress={toggleShelterMode}
                            >
                                <Text style={{ color: '#fff', fontSize: 11, fontWeight: 'bold' }}>
                                    {shelterOverride ? 'Bật Tự Động' : 'Tắt Tự Động'}
                                </Text>
                            </TouchableOpacity>
                            <View style={styles.switchContainer}>
                                <Switch 
                                    value={shelterState} 
                                    onValueChange={controlShelter} 
                                    trackColor={{ true: theme.primary, false: theme.subText }}
                                    thumbColor={shelterState ? '#fff' : '#f4f3f4'}
                                />
                            </View>
                        </View>
                    </View>
                </View>

            </View>
          </View>
        </View>

        {/* SECTION 2: CẢM BIẾN */}
        <View style={[styles.section, { borderBottomColor: 'transparent' }]}>
          <View style={[
            styles.sensorCard, 
            { 
              backgroundColor: theme.card,
              borderColor: theme.border,
            }
          ]}>
            {/* Header */}
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 15 }}>
              <View style={[styles.iconBadge, { backgroundColor: theme.primary + '20', marginBottom: 0 }]}>
                <Ionicons name="pulse-outline" size={20} color={theme.primary} />
              </View>
              <Text style={[styles.sectionTitle, { color: theme.text, marginLeft: 10, marginBottom: 0 }]}>Cảm biến</Text>
            </View>
            {/* Nội dung cảm biến */}
            <View style={[styles.sensorRow, { backgroundColor: theme.primary + '10', padding: 12, borderRadius: 12, marginBottom: 8 }]}>
              <View style={[styles.sensorIconContainer, { backgroundColor: '#EF4444' + '20' }]}>
                <Ionicons name="thermometer" size={28} color="#EF4444" />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={{ color: theme.subText, fontSize: 12, marginBottom: 2 }}>Nhiệt độ</Text>
                <Text style={[styles.sensorText, { color: theme.text, fontSize: 18, fontWeight: 'bold' }]}>
                  {sensorsData.temperature ?? '--'} °C
                </Text>
              </View>
            </View>
            <View style={[styles.sensorRow, { backgroundColor: theme.primary + '10', padding: 12, borderRadius: 12, marginBottom: 8 }]}>
              <View style={[styles.sensorIconContainer, { backgroundColor: '#3B82F6' + '20' }]}>
                <Ionicons name="water" size={28} color="#3B82F6" />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={{ color: theme.subText, fontSize: 12, marginBottom: 2 }}>Độ ẩm</Text>
                <Text style={[styles.sensorText, { color: theme.text, fontSize: 18, fontWeight: 'bold' }]}>
                  {sensorsData.humidity ?? '--'} %
                </Text>
              </View>
            </View>
            <View style={[
              styles.sensorRow, 
              { 
                backgroundColor: (sensorsData.isRaining ? theme.danger : theme.success) + '15', 
                padding: 12, 
                borderRadius: 12 
              }
            ]}>
              <View style={[
                styles.sensorIconContainer, 
                { backgroundColor: (sensorsData.isRaining ? theme.danger : theme.success) + '30' }
              ]}>
                <Ionicons name={sensorsData.isRaining ? "rainy" : "sunny"} size={28} color={sensorsData.isRaining ? theme.danger : theme.success} />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={{ color: theme.subText, fontSize: 12, marginBottom: 2 }}>Thời tiết</Text>
                <Text style={[
                  styles.sensorText, 
                  { 
                    color: sensorsData.isRaining ? theme.danger : theme.success, 
                    fontSize: 18, 
                    fontWeight: 'bold' 
                  }
                ]}>
                  {sensorsData.isRaining ? 'Có mưa!' : 'Trời nắng'}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* SECTION 3: CÁC PHÒNG */}
        <View style={styles.section}>
          <View style={[
            styles.sensorCard,
            {
              backgroundColor: theme.card,
              borderColor: theme.border,
            }
          ]}>
            {/* Header */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 15 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <View style={[styles.iconBadge, { backgroundColor: theme.primary + '20', marginBottom: 0 }]}>
                  <Ionicons name="home-outline" size={20} color={theme.primary} />
                </View>
                <Text style={[styles.sectionTitle, { color: theme.text, marginLeft: 10, marginBottom: 0 }]}>Các phòng</Text>
              </View>
              <TouchableOpacity style={[styles.addRoomBtn, { backgroundColor: theme.primary }]} onPress={handleAddRoom}>
                <Ionicons name="add" size={22} color="#FFF" />
              </TouchableOpacity>
            </View>
            {/* Nội dung danh sách phòng */}
            <FlatList
              data={rooms}
              keyExtractor={item => item.id}
              renderItem={renderRoomItem}
              scrollEnabled={false}
              ListEmptyComponent={<Text style={{ textAlign: 'center', color: theme.subText, marginTop: 20 }}>Chưa có phòng nào</Text>}
            />
          </View>
        </View>
      </ScrollView>

      {/* MODAL THÊM PHÒNG */}
      <Modal visible={isAddRoomVisible} transparent animationType="fade" onRequestClose={() => setIsAddRoomVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalContainer, { backgroundColor: theme.card }]}>
            <View style={styles.modalHeader}>
              <TouchableOpacity 
                onPress={() => { setNewRoomName(''); setIsAddRoomVisible(false); }}
                style={styles.backButton}
              >
                <Ionicons name="arrow-back" size={24} color={theme.text} />
              </TouchableOpacity>
              <Text style={[styles.modalTitle, { color: theme.text, flex: 1, textAlign: 'center' }]}>Thêm phòng mới</Text>
              <View style={{ width: 32 }} />
            </View>
            <TextInput
              placeholder="Tên phòng"
              value={newRoomName}
              onChangeText={setNewRoomName}
              placeholderTextColor={theme.subText}
              style={[styles.input, { backgroundColor: theme.background, color: theme.text, borderColor: theme.border, width: '100%' }]}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={[styles.modalButton, { borderColor: theme.border }]} onPress={() => { setNewRoomName(''); setIsAddRoomVisible(false); }}>
                <Text style={{ color: theme.text }}>Hủy</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalButton, { backgroundColor: theme.primary }]} onPress={handleConfirmAddRoom}>
                <Text style={{ color: '#fff', fontWeight: 'bold' }}>Thêm</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

/**
 * RoomDetailScreen - Màn hình chi tiết phòng
 * Hiển thị danh sách thiết bị trong phòng và cho phép:
 * - Thêm/xóa thiết bị
 * - Bật/tắt thiết bị
 * - Chọn GPIO pin (tự động lọc các pin đã sử dụng)
 */
const RoomDetailScreen: React.FC<RoomDetailScreenNavigationProp> = ({ route, navigation }) => {
  const { roomId, title } = route.params;
  const { rooms, addDevice, deleteDevice, toggleDevice } = useContext(AppContext);
  const { theme } = useContext(ThemeContext);
  
  const [isAddDeviceVisible, setIsAddDeviceVisible] = useState(false);
  const [isPinPickerVisible, setIsPinPickerVisible] = useState(false);

  const [newDeviceName, setNewDeviceName] = useState('');
  const [selectedPin, setSelectedPin] = useState<number | null>(null);
  const [newDeviceType, setNewDeviceType] = useState<'light' | 'fan'>('light');

  // Danh sách gốc: Tất cả các chân cho phép
  const VALID_GPIO_PINS = [
    4, 13, 18, 19, 22, 23, 25, 26, 32, 33
  ];
  useLayoutEffect(() => {
    navigation.setOptions({ title });
  }, [navigation, title]);

  const room = rooms.find(r => r.id === roomId);

  if (!room) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.background }}>
        <ActivityIndicator size="large" color={theme.primary} />
        <Text style={{ marginTop: 10, color: theme.subText }}>Đang tải dữ liệu...</Text>
      </View>
    );
  }

  // --- LOGIC LỌC CHÂN GPIO (QUAN TRỌNG) ---
  
  // 1. Tổng hợp tất cả các chân GPIO đã dùng ở mọi phòng
  const usedPinsGlobal = rooms.flatMap(r => r.devices.map(device => device.pin));

  // 2. Danh sách hiển thị: chỉ giữ những chân chưa dùng ở bất kỳ phòng nào
  const availablePins = VALID_GPIO_PINS.filter(pin => !usedPinsGlobal.includes(pin));

  // ----------------------------------------

  // Xử lý thêm thiết bị
  const handleAddDevice = () => {
    setIsAddDeviceVisible(true);
  };

  // Xác nhận thêm thiết bị
  const handleConfirmAddDevice = async () => {
    const name = newDeviceName.trim();

    if (!name) {
      Alert.alert('Thông báo', 'Tên thiết bị không được để trống.');
      return;
    }
    
    if (selectedPin === null) {
      Alert.alert('Thông báo', 'Vui lòng chọn chân GPIO.');
      return;
    }

    await addDevice(roomId, name, selectedPin, newDeviceType);
    
    setNewDeviceName('');
    setSelectedPin(null);
    setNewDeviceType('light');
    setIsAddDeviceVisible(false);
  };

  // Xác nhận xóa thiết bị
  const handleDeleteDevice = (deviceId: string, deviceName: string) => {
    Alert.alert('Xóa thiết bị', `Bạn có chắc muốn xóa "${deviceName}"?`, [
      { text: 'Hủy', style: 'cancel' },
      { text: 'Xóa', style: 'destructive', onPress: () => deleteDevice(roomId, deviceId, deviceName, title) },
    ]);
  };

  // Render item thiết bị trong FlatList
  const renderDevice = ({ item }: { item: Device }) => (
    <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
        <Ionicons
          name={item.type === 'fan' ? (item.state ? 'ellipse' : 'power-outline') : (item.state ? 'bulb' : 'bulb-outline')}
          size={28}
          color={item.state ? (item.type === 'fan' ? theme.success : '#FFD700') : theme.subText}
        />
        <View style={{ marginLeft: 15, flex: 1 }}>
            <Text style={[styles.cardTitle, { color: theme.text }]}>{item.name}</Text>
            <Text style={{ color: theme.subText, fontSize: 12 }}>
                GPIO: {item.pin !== undefined ? item.pin : 'N/A'}
            </Text>
        </View>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Switch
          value={!!item.state} 
          onValueChange={() => toggleDevice(roomId, item.id, item.name, title, item.state)}
          trackColor={{ true: theme.primary, false: theme.subText }}
        />
        <TouchableOpacity 
          onPress={() => handleDeleteDevice(item.id, item.name)} 
          style={[styles.iconButton, { marginLeft: 10 }]}
        >
          <Ionicons name="trash-outline" size={22} color={theme.danger} />
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <View style={{ padding: 15, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.border }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={[styles.sectionTitle, { color: theme.text, marginBottom: 0 }]}>Thiết bị</Text>
          <TouchableOpacity style={[styles.addRoomBtn, { backgroundColor: theme.primary }]} onPress={handleAddDevice}>
            <Ionicons name="add" size={22} color="#FFF" />
          </TouchableOpacity>
        </View>
      </View>
      <FlatList
        data={room.devices}
        keyExtractor={item => item.id}
        renderItem={renderDevice}
        contentContainerStyle={{ padding: 15 }}
        ListEmptyComponent={<Text style={{ textAlign: 'center', color: theme.subText, marginTop: 20 }}>Chưa có thiết bị nào.</Text>}
      />
      
      {/* MODAL THÊM THIẾT BỊ */}
      <Modal visible={isAddDeviceVisible} transparent animationType="fade" onRequestClose={() => setIsAddDeviceVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalContainer, { backgroundColor: theme.card }]}>
            <View style={styles.modalHeader}>
              <TouchableOpacity 
                onPress={() => { setIsAddDeviceVisible(false); setNewDeviceName(''); setSelectedPin(null); }}
                style={styles.backButton}
              >
                <Ionicons name="arrow-back" size={24} color={theme.text} />
              </TouchableOpacity>
              <Text style={[styles.modalTitle, { color: theme.text, flex: 1, textAlign: 'center' }]}>Thêm thiết bị mới</Text>
              <View style={{ width: 32 }} />
            </View>
            
            <TextInput
              placeholder="Tên thiết bị (VD: Đèn trần)"
              placeholderTextColor={theme.subText}
              value={newDeviceName}
              onChangeText={setNewDeviceName}
              style={[styles.input, { backgroundColor: theme.background, color: theme.text, borderColor: theme.border, width: '100%' }]}
            />
            
            <TouchableOpacity 
              style={[styles.input, { backgroundColor: theme.background, borderColor: theme.border, width: '100%', justifyContent: 'center' }]}
              onPress={() => setIsPinPickerVisible(true)}
            >
              <Text style={{ color: selectedPin !== null ? theme.text : theme.subText }}>
                {selectedPin !== null ? `Đã chọn: GPIO ${selectedPin}` : 'Chọn chân GPIO (Nhấn để chọn)'}
              </Text>
              <Ionicons name="chevron-down" size={20} color={theme.subText} style={{ position: 'absolute', right: 10 }} />
            </TouchableOpacity>

            <View style={styles.typeSelector}>
              {(['light', 'fan'] as const).map(type => (
                <TouchableOpacity
                  key={type}
                  style={[
                    styles.typeOption,
                    {
                      borderColor: type === newDeviceType ? theme.primary : theme.border,
                      backgroundColor: type === newDeviceType ? theme.primary : 'transparent',
                    },
                  ]}
                  onPress={() => setNewDeviceType(type)}
                >
                  <Text style={{ color: type === newDeviceType ? '#fff' : theme.text }}>{type === 'light' ? 'Đèn' : 'Quạt'}</Text>
                </TouchableOpacity>
              ))}
            </View>
            
            <View style={styles.modalActions}>
              <TouchableOpacity style={[styles.modalButton, { borderColor: theme.border }]} onPress={() => { setIsAddDeviceVisible(false); setNewDeviceName(''); setSelectedPin(null); }}>
                <Text style={{ color: theme.text }}>Hủy</Text>
              </TouchableOpacity>
              
              <TouchableOpacity style={[styles.modalButton, { backgroundColor: theme.primary }]} onPress={handleConfirmAddDevice}>
                <Text style={{ color: '#fff', fontWeight: 'bold' }}>Thêm</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* MODAL CHỌN GPIO (Đã lọc những chân đã dùng) */}
      <Modal visible={isPinPickerVisible} transparent animationType="slide" onRequestClose={() => setIsPinPickerVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalContainer, { backgroundColor: theme.card, height: '70%' }]}>
            <View style={styles.modalHeader}>
              <TouchableOpacity 
                onPress={() => setIsPinPickerVisible(false)}
                style={styles.backButton}
              >
                <Ionicons name="arrow-back" size={24} color={theme.text} />
              </TouchableOpacity>
              <Text style={[styles.modalTitle, { color: theme.text, flex: 1, textAlign: 'center' }]}>Chọn chân GPIO</Text>
              <View style={{ width: 32 }} />
            </View>
            <Text style={{color: theme.subText, textAlign: 'center', marginBottom: 10}}>
                {availablePins.length > 0 ? 'Các chân dưới đây chưa được sử dụng:' : 'Đã hết chân GPIO trống!'}
            </Text>
            
            <FlatList 
              data={availablePins} // Dùng danh sách chân đã lọc
              keyExtractor={(item) => item.toString()}
              renderItem={({ item }) => (
                <TouchableOpacity 
                  style={{
                    padding: 15,
                    borderBottomWidth: 1,
                    borderBottomColor: theme.border,
                  }}
                  onPress={() => {
                    setSelectedPin(item);
                    setIsPinPickerVisible(false);
                  }}
                >
                  <Text style={{ 
                    fontSize: 16,
                    color: selectedPin === item ? theme.primary : theme.text,
                    textAlign: 'center',
                  }}>
                    GPIO {item}
                  </Text>
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                 <Text style={{textAlign: 'center', marginTop: 20, color: theme.danger}}>
                    Bạn đã sử dụng hết tất cả chân GPIO trong phòng này.
                 </Text>
              }
            />
            
            <TouchableOpacity 
              style={[styles.btn, { backgroundColor: theme.subText, marginTop: 10 }]} 
              onPress={() => setIsPinPickerVisible(false)}
            >
              <Text style={{ color: '#fff' }}>Đóng</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

/**
 * HistoryScreen - Màn hình lịch sử hoạt động
 * Hiển thị 20 hoạt động gần nhất (từ mới đến cũ)
 */
const HistoryScreen: React.FC<TabBarScreenProps<'History'>> = () => {
  const { history } = useContext(AppContext);
  const { theme } = useContext(ThemeContext);

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <FlatList
        data={history}
        keyExtractor={item => item.id}
        renderItem={({ item }: { item: HistoryItem }) => (
          <View style={[styles.historyItem, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={{ color: theme.text, fontSize: 16 }}>{item.content}</Text>
            <Text style={{ color: theme.subText, fontSize: 12, marginTop: 4 }}>{item.time}</Text>
          </View>
        )}
        contentContainerStyle={{ padding: 15 }}
        ListEmptyComponent={<Text style={{ textAlign: 'center', color: theme.subText, marginTop: 20 }}>Chưa có lịch sử hoạt động.</Text>}
      />
    </View>
  );
};

/**
 * ProfileScreen - Màn hình cá nhân
 * Chức năng:
 * - Chuyển đổi chế độ sáng/tối
 * - Đổi mật khẩu
 * - Gửi phản hồi qua email
 * - Xem thông tin về ứng dụng
 * - Đăng xuất
 */
const ProfileScreen: React.FC<TabBarScreenProps<'Profile'>> = () => {
  const { user, logout } = useContext(AuthContext);
  const { isDarkMode, setIsDarkMode, theme } = useContext(ThemeContext);
  const [isChangePwVisible, setIsChangePwVisible] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPw, setChangingPw] = useState(false);
  const [isFeedbackVisible, setIsFeedbackVisible] = useState(false);
  const [feedbackText, setFeedbackText] = useState('');
  const [sendingFeedback, setSendingFeedback] = useState(false);
  const [isAboutVisible, setIsAboutVisible] = useState(false);

  interface ProfileItemProps {
    icon: string;
    text: string;
    right?: React.ReactNode;
    color?: string;
    onPress?: () => void;
  }

  const Item: React.FC<ProfileItemProps> = ({ icon, text, right, color, onPress }) => (
    <TouchableOpacity onPress={onPress} style={[styles.settingItem, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Ionicons name={icon} size={22} color={color || theme.primary} />
        <Text style={{ marginLeft: 15, fontSize: 16, color: color || theme.text }}>{text}</Text>
      </View>
      {right}
    </TouchableOpacity>
  );

  const handleChangePassword = async () => {
    if (!user?.email) {
      Alert.alert('Lỗi', 'Không tìm thấy email người dùng.');
      return;
    }
    const cur = currentPassword.trim();
    const next = newPassword.trim();
    const confirm = confirmPassword.trim();

    if (!cur || !next || !confirm) {
      Alert.alert('Thông báo', 'Vui lòng nhập đủ các trường.');
      return;
    }
    if (next.length < 6) {
      Alert.alert('Thông báo', 'Mật khẩu mới phải có ít nhất 6 ký tự.');
      return;
    }
    if (next !== confirm) {
      Alert.alert('Thông báo', 'Mật khẩu xác nhận không khớp.');
      return;
    }

    try {
      setChangingPw(true);
      const credential = auth.EmailAuthProvider.credential(user.email, cur);
      await auth().currentUser?.reauthenticateWithCredential(credential);
      await auth().currentUser?.updatePassword(next);
      Alert.alert('Thành công', 'Đã đổi mật khẩu.');
      setIsChangePwVisible(false);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (error: any) {
      console.error('Lỗi đổi mật khẩu:', error);
      const msg = error?.code === 'auth/wrong-password'
        ? 'Mật khẩu hiện tại không đúng.'
        : 'Không thể đổi mật khẩu. Vui lòng thử lại.';
      Alert.alert('Lỗi', msg);
    } finally {
      setChangingPw(false);
    }
  };

  const handleSendFeedback = async () => {
    const content = feedbackText.trim();
    if (!content) {
      Alert.alert('Thông báo', 'Vui lòng nhập nội dung phản hồi.');
      return;
    }
    const mail = 'Nhom3PTUDTTBDD@gmail.com';
    const subject = 'Báo cáo/Phản hồi từ ứng dụng Smart Home';
    const body = `${content}\n\nNgười gửi: ${user?.email ?? 'Ẩn danh'}`;
    const url = `mailto:${mail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    try {
      setSendingFeedback(true);
      await Linking.openURL(url);
      setFeedbackText('');
      setIsFeedbackVisible(false);
    } catch (error) {
      console.error('Lỗi gửi phản hồi:', error);
      Alert.alert('Lỗi', 'Không thể mở ứng dụng mail. Vui lòng thử lại.');
    } finally {
      setSendingFeedback(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
        <View style={{ alignItems: 'center', padding: 30 }}>
          <Ionicons name="person-circle" size={80} color={theme.subText} />
          <Text style={{ fontSize: 20, fontWeight: 'bold', color: theme.text, marginTop: 10 }}>
            {user ? (user.email ? user.email.split('@')[0] : 'Người dùng') : 'Chưa đăng nhập'}
          </Text>
          <Text style={[styles.profileEmail, { color: theme.text }]}>{user ? user.email : 'Chưa đăng nhập'}</Text>
        </View>

        <View style={[styles.section, { borderBottomColor: theme.border }]}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Cài đặt</Text>
          <Item
            icon="moon"
            text="Chế độ tối"
            right={<Switch value={isDarkMode} onValueChange={setIsDarkMode} trackColor={{ true: theme.primary, false: theme.subText }} />}
          />
          <Item icon="lock-closed" text="Đổi mật khẩu" right={<Ionicons name="chevron-forward" size={20} color={theme.subText} />} onPress={() => setIsChangePwVisible(true)} />
          <Item icon="mail" text="Gửi phản hồi" right={<Ionicons name="chevron-forward" size={20} color={theme.subText} />} onPress={() => setIsFeedbackVisible(true)} />
          <Item icon="information-circle" text="About" right={<Ionicons name="chevron-forward" size={20} color={theme.subText} />} onPress={() => setIsAboutVisible(true)} />
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Tài khoản</Text>
          <Item icon="log-out" text="Đăng xuất" color={theme.danger} onPress={logout} />
        </View>

        <View style={{ alignItems: 'center', paddingVertical: 10 }}>
          <Text style={[styles.watermarkText, { color: theme.subText }]}>by Nhóm 3</Text>
        </View>
      </ScrollView>

      {/* Modal đổi mật khẩu */}
      <Modal visible={isChangePwVisible} transparent animationType="fade" onRequestClose={() => setIsChangePwVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalContainer, { backgroundColor: theme.card }]}>
            <View style={styles.modalHeader}>
              <TouchableOpacity 
                onPress={() => {
                  setIsChangePwVisible(false);
                  setCurrentPassword('');
                  setNewPassword('');
                  setConfirmPassword('');
                }}
                style={styles.backButton}
                disabled={changingPw}
              >
                <Ionicons name="arrow-back" size={24} color={theme.text} />
              </TouchableOpacity>
              <Text style={[styles.modalTitle, { color: theme.text, flex: 1, textAlign: 'center' }]}>Đổi mật khẩu</Text>
              <View style={{ width: 32 }} />
            </View>
            <TextInput
              placeholder="Mật khẩu hiện tại"
              placeholderTextColor={theme.subText}
              value={currentPassword}
              onChangeText={setCurrentPassword}
              secureTextEntry
              style={[styles.input, { backgroundColor: theme.background, color: theme.text, borderColor: theme.border, width: '100%' }]}
            />
            <TextInput
              placeholder="Mật khẩu mới"
              placeholderTextColor={theme.subText}
              value={newPassword}
              onChangeText={setNewPassword}
              secureTextEntry
              style={[styles.input, { backgroundColor: theme.background, color: theme.text, borderColor: theme.border, width: '100%' }]}
            />
            <TextInput
              placeholder="Nhập lại mật khẩu mới"
              placeholderTextColor={theme.subText}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry
              style={[styles.input, { backgroundColor: theme.background, color: theme.text, borderColor: theme.border, width: '100%' }]}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalButton, { borderColor: theme.border }]}
                onPress={() => {
                  setIsChangePwVisible(false);
                  setCurrentPassword('');
                  setNewPassword('');
                  setConfirmPassword('');
                }}
                disabled={changingPw}
              >
                <Text style={{ color: theme.text }}>Hủy</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: theme.primary }]}
                onPress={handleChangePassword}
                disabled={changingPw}
              >
                {changingPw
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={{ color: '#fff', fontWeight: 'bold' }}>Đổi</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal gửi phản hồi */}
      <Modal visible={isFeedbackVisible} transparent animationType="fade" onRequestClose={() => setIsFeedbackVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalContainer, { backgroundColor: theme.card }]}>
            <View style={styles.modalHeader}>
              <TouchableOpacity 
                onPress={() => {
                  setIsFeedbackVisible(false);
                  setFeedbackText('');
                }}
                style={styles.backButton}
                disabled={sendingFeedback}
              >
                <Ionicons name="arrow-back" size={24} color={theme.text} />
              </TouchableOpacity>
              <Text style={[styles.modalTitle, { color: theme.text, flex: 1, textAlign: 'center' }]}>Gửi phản hồi</Text>
              <View style={{ width: 32 }} />
            </View>
            <TextInput
              placeholder="Nhập nội dung báo cáo/ phản hồi..."
              placeholderTextColor={theme.subText}
              value={feedbackText}
              onChangeText={setFeedbackText}
              multiline
              style={[styles.input, { backgroundColor: theme.background, color: theme.text, borderColor: theme.border, width: '100%', height: 120, textAlignVertical: 'top' }]}
            />
            <Text style={{ color: theme.subText, fontSize: 12, marginTop: 6 }}>
              Email nhận: Nhom3PTUDTTBDD@gmail.com
            </Text>
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalButton, { borderColor: theme.border }]}
                onPress={() => {
                  setIsFeedbackVisible(false);
                  setFeedbackText('');
                }}
                disabled={sendingFeedback}
              >
                <Text style={{ color: theme.text }}>Hủy</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: theme.primary }]}
                onPress={handleSendFeedback}
                disabled={sendingFeedback}
              >
                {sendingFeedback
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={{ color: '#fff', fontWeight: 'bold' }}>Gửi</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal About */}
      <Modal visible={isAboutVisible} transparent animationType="fade" onRequestClose={() => setIsAboutVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalContainer, { backgroundColor: theme.card }]}>
            <View style={styles.modalHeader}>
              <TouchableOpacity 
                onPress={() => setIsAboutVisible(false)}
                style={styles.backButton}
              >
                <Ionicons name="arrow-back" size={24} color={theme.text} />
              </TouchableOpacity>
              <Text style={[styles.modalTitle, { color: theme.text, flex: 1, textAlign: 'center' }]}>About</Text>
              <View style={{ width: 32 }} />
            </View>
            <View style={{ marginTop: 10 }}>
              <View style={{ flexDirection: 'column', alignItems: 'center', marginBottom: 20 }}>
                <Text style={{ marginLeft: 10, fontSize: 18, fontWeight: 'bold', color: theme.text }}>GVHD: TS.Nguyễn Văn Khanh</Text>
                <Ionicons name="people" size={24} color={theme.primary} />
                <Text style={{ marginLeft: 10, fontSize: 18, fontWeight: 'bold', color: theme.text }}>Thành viên nhóm 3</Text>
              </View>
              <View style={{ marginBottom: 15 }}>
                <Text style={{ color: theme.text, fontSize: 16, fontWeight: '600' }}>Lê Tiến Đạt</Text>
                <Text style={{ color: theme.subText, fontSize: 14, marginTop: 4 }}>B2308281</Text>
              </View>
              <View style={{ marginBottom: 15 }}>
                <Text style={{ color: theme.text, fontSize: 16, fontWeight: '600' }}>Lê Minh Triết</Text>
                <Text style={{ color: theme.subText, fontSize: 14, marginTop: 4 }}>B2308335</Text>
              </View>
              <View style={{ marginBottom: 15 }}>
                <Text style={{ color: theme.text, fontSize: 16, fontWeight: '600' }}>Nguyễn Hoàng Khang</Text>
                <Text style={{ color: theme.subText, fontSize: 14, marginTop: 4 }}>B2308300</Text>
              </View>
              <View style={{ marginBottom: 15 }}>
                <Text style={{ color: theme.text, fontSize: 16, fontWeight: '600' }}>Nguyễn Hoàng Khải</Text>
                <Text style={{ color: theme.subText, fontSize: 14, marginTop: 4 }}>B2308304</Text>
              </View>
              <View>
                <Text style={{ color: theme.text, fontSize: 16, fontWeight: '600' }}>Phan Duy Đăng</Text>
                <Text style={{ color: theme.subText, fontSize: 14, marginTop: 4 }}>B2308285</Text>
              </View>
            </View>
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: theme.primary, flex: 1 }]}
                onPress={() => setIsAboutVisible(false)}
              >
                <Text style={{ color: '#fff', fontWeight: 'bold' , textAlign: 'center'}}>Đóng</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

// ========================================================================================
// NAVIGATION SETUP - THIẾT LẬP ĐIỀU HƯỚNG
// ========================================================================================

/**
 * HomeStack - Stack Navigator cho màn hình Home và RoomDetail
 * Cho phép điều hướng từ HomeScreen sang RoomDetailScreen và quay lại
 */
const HomeStack: React.FC = () => {
  const { theme } = useContext(ThemeContext);
  const Stack = createNativeStackNavigator<RootStackParamList>();
  const logo = require('./imgs/Logo_CTU.png');

  return (
    <Stack.Navigator
      id={undefined}
      screenOptions={{
        headerStyle: { backgroundColor: theme.primary },
        headerTintColor: '#f1eeeeff',
        headerTitleStyle: { fontWeight: 'bold' } as const,
        headerLeft: () => (
          <Image
            source={logo}
            style={{ width: 32, height: 32, marginRight: 10, resizeMode: 'contain' }}
          />
        ),
      }}
    >
      <Stack.Screen name="HomeScreen" component={HomeScreen} options={{ title: 'Trang chủ Smart Home' }} />
      <Stack.Screen 
        name="RoomDetail" 
        component={RoomDetailScreen} 
        options={({ route, navigation }) => ({ 
          title: route.params.title,
          headerLeft: () => (
            <TouchableOpacity
              onPress={() => navigation.goBack()}
              style={{ marginLeft: 10, padding: 8 }}
            >
              <Ionicons name="arrow-back" size={24} color="#f1eeeeff" />
            </TouchableOpacity>
          ),
        })} 
      />
    </Stack.Navigator>
  );
};

/**
 * MainApp - Component chính chứa Bottom Tab Navigator
 * Có 3 tab: Home, History, Profile
 */
const MainApp: React.FC = () => {
  const { theme, navTheme } = useContext(ThemeContext);
  const Tab = createBottomTabNavigator<RootTabParamList>();
  const logo = require('./imgs/Logo_CTU.png');

  return (
    <NavigationContainer theme={navTheme}>
      <Tab.Navigator
        id={undefined}
        screenOptions={({ route }) => ({
          // Icon cho mỗi tab (filled khi active, outline khi inactive)
          tabBarIcon: ({ focused, color, size }) => {
            let iconName: string;
            if (route.name === 'Home') iconName = focused ? 'home' : 'home-outline';
            else if (route.name === 'History') iconName = focused ? 'time' : 'time-outline';
            else iconName = focused ? 'person' : 'person-outline';
            return <Ionicons name={iconName} size={size} color={color} />;
          },
          tabBarActiveTintColor: theme.primary,      // Màu tab đang active
          tabBarInactiveTintColor: theme.subText,    // Màu tab không active
          headerShown: false,                        // Ẩn header mặc định
          tabBarStyle: { backgroundColor: theme.card, borderTopColor: theme.border },
          tabBarLabelStyle: { fontSize: 12 },
        })}
      >
        <Tab.Screen name="Home" component={HomeStack} options={{ title: 'Trang chủ' }} />
        <Tab.Screen
          name="History"
          component={HistoryScreen}
          options={{
            title: 'Lịch sử',
            headerShown: true,                        // Hiển thị header cho tab này
            headerStyle: { backgroundColor: theme.primary },
            headerTintColor: '#f1eeeeff',
            headerTitleStyle: { fontWeight: 'bold' } as const,
            headerLeft: () => (
              <Image
                source={logo}
                style={{ width: 32, height: 32, marginLeft: 10, resizeMode: 'contain' }}
              />
            ),
          }}
        />
        <Tab.Screen
          name="Profile"
          component={ProfileScreen}
          options={{
            title: 'Cá nhân',
            headerShown: true,                        // Hiển thị header cho tab này
            headerStyle: { backgroundColor: theme.primary },
            headerTintColor: '#f1eeeeff',
            headerTitleStyle: { fontWeight: 'bold' } as const,
            headerLeft: () => (
              <Image
                source={logo}
                style={{ width: 32, height: 32, marginLeft: 10, resizeMode: 'contain' }}
              />
            ),
          }}
        />
      </Tab.Navigator>
    </NavigationContainer>
  );
};

/**
 * AppContent - Component điều phối hiển thị LoginScreen hoặc MainApp
 * Dựa vào trạng thái đăng nhập (user) để quyết định hiển thị màn hình nào
 */
const AppContent: React.FC = () => {
  const { user } = useContext(AuthContext);
  const { isDarkMode, theme } = useContext(ThemeContext);

  return (
    <>
      {/* StatusBar - Thanh trạng thái hệ thống */}
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} backgroundColor={theme.background} />
      {/* Hiển thị LoginScreen nếu chưa đăng nhập, MainApp nếu đã đăng nhập */}
      {user ? <AppProvider><MainApp /></AppProvider> : <LoginScreen />}
    </>
  );
};

/**
 * App - Component của ứng dụng
 * Khởi tạo các Provider và hiển thị splash screen khi khởi động
 */
const App = () => {
  const [isAppReady, setIsAppReady] = useState(false);

  // Delay 1 giây để hiển thị splash screen khi khởi động
  useEffect(() => {
    const timeout = setTimeout(() => setIsAppReady(true), 1000);
    return () => clearTimeout(timeout);
  }, []);

  // Hiển thị loading khi chưa sẵn sàng
  if (!isAppReady) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
        <Text>Đang khởi tạo ứng dụng...</Text>
      </View>
    );
  }

  // Bọc toàn bộ app trong các Provider theo thứ tự:
  // ThemeProvider -> AuthProvider -> AppContent
  return (
    <ThemeProvider>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </ThemeProvider>
  );
};

export default App;

// ========================================================================================
// STYLESHEET - ĐỊNH NGHĨA STYLES CHO TẤT CẢ COMPONENTS
// ========================================================================================

/** Các thuộc tính style được dùng
 * flexDirection - sắp xếp theo hàng/cột
 * justifyContent - căn chỉnh theo chiều chính
 * alignItems - căn chỉnh theo chiều phụ
 * padding/margin - khoảng cách bên trong/bên ngoài
 * borderRadius - bo góc
 * shadow... - hiệu ứng bóng
 * elevation - hiệu ứng bóng đổ trên Android
 * fontSize/fontWeight - kích thước/độ đậm chữ
 * textAlign - căn chỉnh chữ
 * backgroundColor/color - màu nền/màu chữ
 * borderColor/borderWidth - màu viền/độ dày viền
 * width/height - chiều rộng/chiều cao
 * resizeMode - chế độ thay đổi kích thước ảnh
 * position - vị trí tuyệt đối
 * transform - biến đổi (dùng để xoay icon)
 */
const styles = StyleSheet.create({
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 30,
  },
  input: {
    width: '100%',
    padding: 15,
    marginVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    fontSize: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  btn: {
    width: '100%',
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  section: {
    padding: 15,
    marginBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 15,
  },
  sensorCard: {
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  sensorRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sensorText: {
    fontSize: 16,
    marginLeft: 10,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  addRoomBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 15,
    marginVertical: 5,
    borderRadius: 10,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
  },
  roomCard: {
    width: '100%',
    marginVertical: 6,
    marginBottom: 10,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  iconBadge: {
    marginBottom: 12,
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    marginTop: 8,
  },
  modeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginTop: 6,
  },
  autoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    alignSelf: 'stretch',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  sensorIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fab: {
    position: 'absolute',
    width: 60,
    height: 60,
    alignItems: 'center',
    justifyContent: 'center',
    right: 20,
    bottom: 20,
    borderRadius: 30,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  historyItem: {
    padding: 15,
    marginVertical: 5,
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: 'column',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
  },
  profileEmail: {
    fontSize: 16,
    marginTop: 10,
  },
  settingItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 15,
    paddingHorizontal: 10,
    marginVertical: 5,
    borderRadius: 10,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
  },
  iconButton: {
    padding: 6,
    marginRight: 10,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContainer: {
    width: '100%',
    borderRadius: 12,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 8,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    flex: 1,
  },
  closeButton: {
    padding: 4,
    marginLeft: 10,
  },
  backButton: {
    padding: 4,
    marginRight: 10,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 10,
  },
  modalButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    marginLeft: 10,
    borderWidth: 1,
  },
  typeSelector: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  typeOption: {
    flex: 1,
    paddingVertical: 10,
    marginHorizontal: 5,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
  },
  autoChip: {
    marginLeft: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  doorCard: {
    padding: 20,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  doorTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: 10,
    marginBottom: 5,
  },
  doorSubtitle: {
    fontSize: 14,
    marginBottom: 15,
    textAlign: 'center',
  },
  watermarkText: {
    fontSize: 13,
    opacity: 0.6,
  },
  doorControl: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  doorLabel: {
    fontSize: 16,
    marginRight: 15,
  },
  switchContainer: {
    transform: [{ scaleX: 1.5 }, { scaleY: 1.5 }],
  },
  doorStatus: {
    fontSize: 18,
    fontWeight: 'bold',
    marginLeft: 15,
  },
});