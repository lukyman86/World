'use client';

import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useState,
} from 'react';
import { MiniKit } from './minikit';

type MiniKitProps = {
  appId: string;
};

const MiniKitContext = createContext<{ isInstalled: boolean }>({
  isInstalled: false,
});

export const MiniKitProvider = ({
  children,
  props,
}: {
  children: ReactNode;
  props?: MiniKitProps;
}) => {
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    MiniKit.install(props?.appId);
    MiniKit.commandsAsync
      .getPermissions()
      .then(({ commandPayload: _, finalPayload }) => {
        if (finalPayload.status === 'success') {
          MiniKit.user.permissions = {
            notifications: finalPayload.permissions.notifications,
            contacts: finalPayload.permissions.contacts,
          };
        }
      });
    setIsInstalled(true);
  }, [props?.appId]);

  return (
    <MiniKitContext.Provider value={{ isInstalled }}>
      {children}
    </MiniKitContext.Provider>
  );
};

// Custom hook to see when minikit is installed
export const useMiniKit = () => {
  const context = useContext(MiniKitContext);
  if (context === undefined) {
    throw new Error('useMiniKit must be used within a MiniKitProvider');
  }
  return context;
};
