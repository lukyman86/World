export type User = {
  walletAddress?: string;
  username?: string;
  profilePictureUrl?: string;
  permissions?: {
    notifications: boolean;
    contacts: boolean;
  };
  // verificationStatus: {
  //   orb: {
  //     isVerified: boolean;
  //     verifiedUntil: number;
  //   };
  //   device: {
  //     isVerified: boolean;
  //     verifiedUntil: number;
  //   };
  // };
  optedIntoOptionalAnalytics?: boolean;
  worldAppVersion?: number;
  deviceOS?: string;
};

export type DeviceProperties = {
  safeAreaInsets?: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
};

export type UserNameService = {
  walletAddress: string;
  username?: string;
  profilePictureUrl?: string;
};
