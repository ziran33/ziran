
import React, { createContext, useContext, useState, useEffect } from 'react';
import { User } from '../types';

interface AuthContextType {
  user: User | null;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string, email: string) => Promise<void>;
  logout: () => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadSession = () => {
      const sessionId = localStorage.getItem('promptlab_session');
      if (sessionId) {
        const users = JSON.parse(localStorage.getItem('promptlab_users') || '[]');
        const found = users.find((u: any) => u.id === sessionId);
        if (found) {
          setUser(found);
        }
      }
      setIsLoading(false);
    };
    loadSession();
  }, []);

  const login = async (username: string, password: string) => {
    return new Promise<void>((resolve, reject) => {
      setTimeout(() => {
        const users = JSON.parse(localStorage.getItem('promptlab_users') || '[]');
        // Simple check (password ignored for mock)
        const found = users.find((u: any) => u.username === username);
        if (found) {
          localStorage.setItem('promptlab_session', found.id);
          setUser(found);
          resolve();
        } else {
          reject(new Error('User not found'));
        }
      }, 500);
    });
  };

  const register = async (username: string, password: string, email: string) => {
    return new Promise<void>((resolve, reject) => {
      setTimeout(() => {
        const users = JSON.parse(localStorage.getItem('promptlab_users') || '[]');
        if (users.find((u: any) => u.username === username)) {
          reject(new Error('Username exists'));
          return;
        }

        const newUser: User = {
          id: `user-${Date.now()}`,
          username,
          email,
          avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${username}`,
          createdAt: Date.now()
        };

        // Legacy Migration Check
        // If this is the FIRST user, migrate all existing "orphaned" data to them
        if (users.length === 0) {
           migrateLegacyData(newUser.id);
        }

        users.push(newUser);
        localStorage.setItem('promptlab_users', JSON.stringify(users));
        localStorage.setItem('promptlab_session', newUser.id);
        setUser(newUser);
        resolve();
      }, 800);
    });
  };

  const migrateLegacyData = (newUserId: string) => {
      console.log("Migrating legacy data to user:", newUserId);
      
      const migrate = (key: string) => {
          const data = JSON.parse(localStorage.getItem(key) || '[]');
          if (data.length > 0) {
              const updated = data.map((item: any) => ({
                  ...item,
                  userId: item.userId || newUserId // Only assign if missing
              }));
              localStorage.setItem(key, JSON.stringify(updated));
          }
      };

      migrate('promptlab_projects');
      migrate('promptlab_versions_v3');
      migrate('promptlab_apis');
      migrate('promptlab_services');
      // Test logs are a dictionary, handle differently if needed, but simpler to leave or clear
  };

  const logout = () => {
    localStorage.removeItem('promptlab_session');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, register, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
