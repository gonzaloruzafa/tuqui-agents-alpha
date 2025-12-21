'use client';

import { useState, useEffect, useCallback } from 'react';

interface UsePushNotificationsResult {
  isSupported: boolean;
  isSubscribed: boolean;
  permission: NotificationPermission | 'unsupported';
  subscribe: () => Promise<boolean>;
  unsubscribe: () => Promise<boolean>;
  isLoading: boolean;
  error: string | null;
}

export function usePushNotifications(tenantId: string): UsePushNotificationsResult {
  const [isSupported, setIsSupported] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>('unsupported');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);

  // Check if push notifications are supported
  useEffect(() => {
    const checkSupport = async () => {
      const supported = 'serviceWorker' in navigator && 
                       'PushManager' in window && 
                       'Notification' in window;
      
      setIsSupported(supported);
      
      if (!supported) {
        setPermission('unsupported');
        setIsLoading(false);
        return;
      }

      setPermission(Notification.permission);

      try {
        // Register service worker
        const reg = await navigator.serviceWorker.register('/sw.js');
        setRegistration(reg);

        // Check current subscription
        const subscription = await reg.pushManager.getSubscription();
        setIsSubscribed(!!subscription);
      } catch (err) {
        console.error('Error setting up push:', err);
        setError('Error al configurar notificaciones');
      }

      setIsLoading(false);
    };

    checkSupport();
  }, []);

  const subscribe = useCallback(async (): Promise<boolean> => {
    if (!isSupported || !registration) {
      setError('Notificaciones no soportadas');
      return false;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Request permission if needed
      if (Notification.permission === 'default') {
        const result = await Notification.requestPermission();
        setPermission(result);
        if (result !== 'granted') {
          setError('Permiso denegado');
          setIsLoading(false);
          return false;
        }
      } else if (Notification.permission === 'denied') {
        setError('Permiso denegado. Habilítalo en configuración del navegador.');
        setIsLoading(false);
        return false;
      }

      // Get VAPID public key from environment
      const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!vapidPublicKey) {
        setError('Configuración de VAPID no disponible');
        setIsLoading(false);
        return false;
      }

      // Subscribe to push
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      });

      // Save subscription to server
      const response = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subscription: subscription.toJSON(),
          tenantId,
        }),
      });

      if (!response.ok) {
        throw new Error('Error al guardar suscripción');
      }

      setIsSubscribed(true);
      setIsLoading(false);
      return true;
    } catch (err) {
      console.error('Subscribe error:', err);
      setError(err instanceof Error ? err.message : 'Error al suscribirse');
      setIsLoading(false);
      return false;
    }
  }, [isSupported, registration, tenantId]);

  const unsubscribe = useCallback(async (): Promise<boolean> => {
    if (!registration) {
      return false;
    }

    setIsLoading(true);
    setError(null);

    try {
      const subscription = await registration.pushManager.getSubscription();
      
      if (subscription) {
        // Unsubscribe from push manager
        await subscription.unsubscribe();

        // Remove from server
        await fetch('/api/push/subscribe', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            endpoint: subscription.endpoint,
            tenantId,
          }),
        });
      }

      setIsSubscribed(false);
      setIsLoading(false);
      return true;
    } catch (err) {
      console.error('Unsubscribe error:', err);
      setError(err instanceof Error ? err.message : 'Error al desuscribirse');
      setIsLoading(false);
      return false;
    }
  }, [registration, tenantId]);

  return {
    isSupported,
    isSubscribed,
    permission,
    subscribe,
    unsubscribe,
    isLoading,
    error,
  };
}

// Helper to convert VAPID key
function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray.buffer;
}
