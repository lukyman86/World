import { sendWebviewEvent } from "./helpers/send-webview-event";
import {
  VerifyCommandInput,
  PayCommandInput,
  EventPayload,
  EventHandler,
  WebViewBasePayload,
  Command,
} from "./types";
import {
  MiniAppPaymentPayload,
  MiniAppSendTransactionPayload,
  MiniAppSignMessagePayload,
  MiniAppSignTypedDataPayload,
  MiniAppVerifyActionPayload,
  MiniAppWalletAuthPayload,
  MiniAppShareContactsPayload,
  ResponseEvent,
  MiniAppSendHapticFeedbackPayload,
} from "./types/responses";
import { Network } from "types/payment";
import {
  AsyncHandlerReturn,
  CommandReturnPayload,
  PayCommandPayload,
  SendHapticFeedbackCommandInput,
  SendHapticFeedbackCommandPayload,
  SendTransactionInput,
  SendTransactionPayload,
  ShareContactsPayload,
  SignMessageInput,
  SignMessagePayload,
  SignTypedDataInput,
  SignTypedDataPayload,
  VerifyCommandPayload,
  WalletAuthInput,
  WalletAuthPayload,
} from "types/commands";
import { VerificationLevel } from "@worldcoin/idkit-core";
import { generateSignal, encodeAction } from "@worldcoin/idkit-core/hashing";

import { validateWalletAuthCommandInput } from "helpers/siwe/validate-wallet-auth-command-input";
import { generateSiweMessage } from "helpers/siwe/siwe";
import {
  MiniKitInstallErrorCodes,
  MiniKitInstallReturnType,
  MiniKitInstallErrorMessage,
} from "types";
import { validatePaymentPayload } from "helpers/payment/client";
import { getUserProfile } from "helpers/usernames";

export const sendMiniKitEvent = <
  T extends WebViewBasePayload = WebViewBasePayload,
>(
  payload: T
) => {
  sendWebviewEvent(payload);
};

export class MiniKit {
  private static readonly MINIKIT_VERSION = 1;

  private static readonly commandVersion = {
    [Command.Verify]: 1,
    [Command.Pay]: 1,
    [Command.WalletAuth]: 1,
    [Command.SendTransaction]: 1,
    [Command.SignMessage]: 1,
    [Command.SignTypedData]: 1,
    [Command.ShareContacts]: 1,
    [Command.SendHapticFeedback]: 1,
  };

  private static isCommandAvailable = {
    [Command.Verify]: false,
    [Command.Pay]: false,
    [Command.WalletAuth]: false,
    [Command.SendTransaction]: false,
    [Command.SignMessage]: false,
    [Command.SignTypedData]: false,
    [Command.ShareContacts]: false,
    [Command.SendHapticFeedback]: false,
  };

  private static listeners: Record<ResponseEvent, EventHandler> = {
    [ResponseEvent.MiniAppVerifyAction]: () => {},
    [ResponseEvent.MiniAppPayment]: () => {},
    [ResponseEvent.MiniAppWalletAuth]: () => {},
    [ResponseEvent.MiniAppSendTransaction]: () => {},
    [ResponseEvent.MiniAppSignMessage]: () => {},
    [ResponseEvent.MiniAppSignTypedData]: () => {},
    [ResponseEvent.MiniAppShareContacts]: () => {},
    [ResponseEvent.MiniAppSendHapticFeedback]: () => {},
  };

  public static appId: string | null = null;
  public static walletAddress: string | null = null;
  public static user: {
    walletAddress: string | null;
    username: string | null;
    profilePictureUrl: string | null;
  } | null = null;

  private static sendInit() {
    sendWebviewEvent({
      command: "init",
      payload: { version: this.MINIKIT_VERSION },
    });
  }

  public static subscribe<E extends ResponseEvent>(
    event: E,
    handler: EventHandler<E>
  ) {
    if (event === ResponseEvent.MiniAppWalletAuth) {
      const originalHandler =
        handler as EventHandler<ResponseEvent.MiniAppWalletAuth>;

      const wrappedHandler: EventHandler<ResponseEvent.MiniAppWalletAuth> = (
        payload
      ) => {
        if (payload.status === "success") {
          MiniKit.walletAddress = payload.address;
          getUserProfile(payload.address).then((queryResponse) => {
            MiniKit.user = {
              username: queryResponse.username,
              profilePictureUrl: queryResponse.profilePictureUrl,
              walletAddress: payload.address,
            };
          });
        }

        originalHandler(payload);
      };

      this.listeners[event] = wrappedHandler as EventHandler<E>;
    } else {
      this.listeners[event] = handler;
    }
  }

  public static unsubscribe(event: ResponseEvent) {
    delete this.listeners[event];
  }

  public static trigger(event: ResponseEvent, payload: EventPayload) {
    if (!this.listeners[event]) {
      console.error(`No handler for event ${event}`);
      return;
    }
    this.listeners[event](payload);
  }

  private static async awaitCommand<
    E extends ResponseEvent,
    C extends Command,
    T extends EventPayload<E>,
  >(
    event: E,
    command: C,
    executor: () => CommandReturnPayload<C> | null
  ): AsyncHandlerReturn<CommandReturnPayload<C> | null, T> {
    return new Promise((resolve) => {
      let commandPayload: CommandReturnPayload<C> | null = null;
      const handleAndUnsubscribe = (payload: EventPayload<E>) => {
        this.unsubscribe(event);
        resolve({ commandPayload, finalPayload: payload as T });
      };
      this.subscribe(event, handleAndUnsubscribe);
      commandPayload = executor();
    });
  }

  private static commandsValid(
    input: NonNullable<typeof window.WorldApp>["supported_commands"]
  ) {
    return Object.entries(this.commandVersion).every(
      ([commandName, version]) => {
        const commandInput = input.find(
          (command) => command.name === commandName
        );

        if (!commandInput) {
          console.error(
            `Command ${commandName} is not supported by the app. Try updating the app version`
          );
        } else {
          MiniKit.isCommandAvailable[commandName] = true;
        }

        return commandInput
          ? commandInput.supported_versions.includes(version)
          : false;
      }
    );
  }

  public static install(appId?: string): MiniKitInstallReturnType {
    if (typeof window === "undefined" || Boolean(window.MiniKit)) {
      return {
        success: false,
        errorCode: MiniKitInstallErrorCodes.AlreadyInstalled,
        errorMessage:
          MiniKitInstallErrorMessage[MiniKitInstallErrorCodes.AlreadyInstalled],
      };
    }

    if (!appId) {
      console.warn("App ID not provided during install");
    } else {
      MiniKit.appId = appId;
    }

    if (!window.WorldApp) {
      return {
        success: false,
        errorCode: MiniKitInstallErrorCodes.OutsideOfWorldApp,
        errorMessage:
          MiniKitInstallErrorMessage[
            MiniKitInstallErrorCodes.OutsideOfWorldApp
          ],
      };
    }

    try {
      window.MiniKit = MiniKit;
      this.sendInit();
    } catch (error) {
      console.error(
        MiniKitInstallErrorMessage[MiniKitInstallErrorCodes.Unknown],
        error
      );

      return {
        success: false,
        errorCode: MiniKitInstallErrorCodes.Unknown,
        errorMessage:
          MiniKitInstallErrorMessage[MiniKitInstallErrorCodes.Unknown],
      };
    }

    // If commands are missing we will install minikit regardless
    if (!this.commandsValid(window.WorldApp.supported_commands)) {
      return {
        success: false,
        errorCode: MiniKitInstallErrorCodes.AppOutOfDate,
        errorMessage:
          MiniKitInstallErrorMessage[MiniKitInstallErrorCodes.AppOutOfDate],
      };
    }

    return { success: true };
  }

  public static isInstalled(debug?: boolean) {
    if (debug) console.log("MiniKit is alive!");
    const isInstalled = Boolean(window.MiniKit);
    if (!isInstalled)
      console.error(
        "MiniKit is not installed. Make sure you're running the application inside of World App"
      );
    return isInstalled;
  }

  public static commands = {
    verify: (payload: VerifyCommandInput): VerifyCommandPayload | null => {
      if (
        typeof window === "undefined" ||
        !this.isCommandAvailable[Command.Verify]
      ) {
        console.error(
          "'verify' command is unavailable. Check MiniKit.install() or update the app version"
        );

        return null;
      }

      const timestamp = new Date().toISOString();
      const eventPayload: VerifyCommandPayload = {
        action: encodeAction(payload.action),
        signal: generateSignal(payload.signal).digest,
        verification_level: payload.verification_level || VerificationLevel.Orb,
        timestamp,
      };

      sendMiniKitEvent({
        command: Command.Verify,
        version: this.commandVersion[Command.Verify],
        payload: eventPayload,
      });

      return eventPayload;
    },
    pay: (payload: PayCommandInput): PayCommandPayload | null => {
      if (
        typeof window === "undefined" ||
        !this.isCommandAvailable[Command.Pay]
      ) {
        console.error(
          "'pay' command is unavailable. Check MiniKit.install() or update the app version"
        );
        return null;
      }

      // Validate the payload
      if (!validatePaymentPayload(payload)) {
        return null;
      }

      const network = Network.WorldChain; // MiniKit only supports Optimism for now

      const eventPayload: PayCommandPayload = {
        ...payload,
        network,
      };

      sendMiniKitEvent<WebViewBasePayload>({
        command: Command.Pay,
        version: this.commandVersion[Command.Pay],
        payload: eventPayload,
      });

      return eventPayload;
    },
    walletAuth: (payload: WalletAuthInput): WalletAuthPayload | null => {
      if (
        typeof window === "undefined" ||
        !this.isCommandAvailable[Command.WalletAuth]
      ) {
        console.error(
          "'walletAuth' command is unavailable. Check MiniKit.install() or update the app version"
        );

        return null;
      }

      const validationResult = validateWalletAuthCommandInput(payload);

      if (!validationResult.valid) {
        console.error(
          "Failed to validate wallet auth input:\n\n -->",
          validationResult.message
        );

        return null;
      }

      let protocol: string | null = null;

      try {
        const currentUrl = new URL(window.location.href);
        protocol = currentUrl.protocol.split(":")[0];
      } catch (error) {
        console.error("Failed to get current URL", error);
        return null;
      }

      const siweMessage = generateSiweMessage({
        scheme: protocol,
        domain: window.location.host,
        statement: payload.statement ?? undefined,
        uri: window.location.href,
        version: 1,
        chain_id: 10,
        nonce: payload.nonce,
        issued_at: new Date().toISOString(),
        expiration_time: payload.expirationTime?.toISOString() ?? undefined,
        not_before: payload.notBefore?.toISOString() ?? undefined,
        request_id: payload.requestId ?? undefined,
      });

      const walletAuthPayload = { siweMessage };

      sendMiniKitEvent<WebViewBasePayload>({
        command: Command.WalletAuth,
        version: this.commandVersion[Command.WalletAuth],
        payload: walletAuthPayload,
      });

      return walletAuthPayload;
    },
    sendTransaction: (
      payload: SendTransactionInput
    ): SendTransactionPayload | null => {
      if (
        typeof window === "undefined" ||
        !this.isCommandAvailable[Command.SendTransaction]
      ) {
        console.error(
          "'sendTransaction' command is unavailable. Check MiniKit.install() or update the app version"
        );

        return null;
      }

      sendMiniKitEvent<WebViewBasePayload>({
        command: Command.SendTransaction,
        version: 1,
        payload,
      });

      return payload;
    },
    signMessage: (payload: SignMessageInput): SignMessagePayload | null => {
      if (
        typeof window === "undefined" ||
        !this.isCommandAvailable[Command.SignMessage]
      ) {
        console.error(
          "'signMessage' command is unavailable. Check MiniKit.install() or update the app version"
        );

        return null;
      }

      sendMiniKitEvent<WebViewBasePayload>({
        command: Command.SignMessage,
        version: 1,
        payload,
      });

      return payload;
    },
    signTypedData: (
      payload: SignTypedDataInput
    ): SignTypedDataPayload | null => {
      if (
        typeof window === "undefined" ||
        !this.isCommandAvailable[Command.SignTypedData]
      ) {
        console.error(
          "'signTypedData' command is unavailable. Check MiniKit.install() or update the app version"
        );

        return null;
      }

      sendMiniKitEvent<WebViewBasePayload>({
        command: Command.SignTypedData,
        version: 1,
        payload,
      });

      return payload;
    },

    shareContacts: (
      payload: ShareContactsPayload
    ): ShareContactsPayload | null => {
      if (
        typeof window === "undefined" ||
        !this.isCommandAvailable[Command.SignTypedData]
      ) {
        console.error(
          "'shareContacts' command is unavailable. Check MiniKit.install() or update the app version"
        );

        return null;
      }
      sendMiniKitEvent<WebViewBasePayload>({
        command: Command.ShareContacts,
        version: 1,
        payload,
      });

      return payload;
    },
    sendHapticFeedback: (
      payload: SendHapticFeedbackCommandInput
    ): SendHapticFeedbackCommandPayload | null => {
      if (
        typeof window === "undefined" ||
        !this.isCommandAvailable[Command.SendHapticFeedback]
      ) {
        console.error(
          "'send-haptic-feedback' command is unavailable. Check MiniKit.install() or update the app version"
        );

        return null;
      }

      sendMiniKitEvent({
        command: Command.SendHapticFeedback,
        version: this.commandVersion[Command.SendHapticFeedback],
        payload,
      });

      return payload;
    },
  };

  /**
   * This object contains async versions of all the commands.
   * Instead of using event listeners, you can just `await` these.
   *
   * They return a standardized object
   *
   * commandPayload - object returned by the command function
   *
   * finalPayload - object returned by the event listener, or in other words, WorldApp response
   */
  public static commandsAsync = {
    verify: async (
      payload: VerifyCommandInput
    ): AsyncHandlerReturn<
      VerifyCommandPayload | null,
      MiniAppVerifyActionPayload
    > => {
      return new Promise(async (resolve, reject) => {
        try {
          const response = await MiniKit.awaitCommand(
            ResponseEvent.MiniAppVerifyAction,
            Command.Verify,
            () => this.commands.verify(payload)
          );
          resolve(response);
        } catch (error) {
          reject(error);
        }
      });
    },
    pay: async (
      payload: PayCommandInput
    ): AsyncHandlerReturn<PayCommandPayload | null, MiniAppPaymentPayload> => {
      return new Promise(async (resolve, reject) => {
        try {
          const response = await MiniKit.awaitCommand(
            ResponseEvent.MiniAppPayment,
            Command.Pay,
            () => this.commands.pay(payload)
          );
          resolve(response);
        } catch (error) {
          reject(error);
        }
      });
    },
    walletAuth: async (
      payload: WalletAuthInput
    ): AsyncHandlerReturn<
      WalletAuthPayload | null,
      MiniAppWalletAuthPayload
    > => {
      return new Promise(async (resolve, reject) => {
        try {
          const response = await MiniKit.awaitCommand(
            ResponseEvent.MiniAppWalletAuth,
            Command.WalletAuth,
            () => this.commands.walletAuth(payload)
          );
          return resolve(response);
        } catch (error) {
          reject(error);
        }
      });
    },
    sendTransaction: async (
      payload: SendTransactionInput
    ): AsyncHandlerReturn<
      SendTransactionPayload | null,
      MiniAppSendTransactionPayload
    > => {
      return new Promise(async (resolve, reject) => {
        try {
          const response = await MiniKit.awaitCommand(
            ResponseEvent.MiniAppSendTransaction,
            Command.SendTransaction,
            () => this.commands.sendTransaction(payload)
          );
          return resolve(response);
        } catch (error) {
          reject(error);
        }
      });
    },
    signMessage: async (
      payload: SignMessageInput
    ): AsyncHandlerReturn<
      SignMessagePayload | null,
      MiniAppSignMessagePayload
    > => {
      return new Promise(async (resolve, reject) => {
        try {
          const response = await MiniKit.awaitCommand(
            ResponseEvent.MiniAppSignMessage,
            Command.SignMessage,
            () => this.commands.signMessage(payload)
          );
          return resolve(response);
        } catch (error) {
          reject(error);
        }
      });
    },
    signTypedData: async (
      payload: SignTypedDataInput
    ): AsyncHandlerReturn<
      SignTypedDataPayload | null,
      MiniAppSignTypedDataPayload
    > => {
      return new Promise(async (resolve, reject) => {
        try {
          const response = await MiniKit.awaitCommand(
            ResponseEvent.MiniAppSignTypedData,
            Command.SignTypedData,
            () => this.commands.signTypedData(payload)
          );
          return resolve(response);
        } catch (error) {
          reject(error);
        }
      });
    },
    shareContacts: async (
      payload: ShareContactsPayload
    ): AsyncHandlerReturn<
      ShareContactsPayload | null,
      MiniAppShareContactsPayload
    > => {
      return new Promise(async (resolve, reject) => {
        try {
          const response = await MiniKit.awaitCommand(
            ResponseEvent.MiniAppShareContacts,
            Command.ShareContacts,
            () => this.commands.shareContacts(payload)
          );
          return resolve(response);
        } catch (error) {
          reject(error);
        }
      });
    },
    sendHapticFeedback: async (
      payload: SendHapticFeedbackCommandInput
    ): AsyncHandlerReturn<
      SendHapticFeedbackCommandPayload | null,
      MiniAppSendHapticFeedbackPayload
    > => {
      return new Promise(async (resolve, reject) => {
        try {
          const response = await MiniKit.awaitCommand(
            ResponseEvent.MiniAppSendHapticFeedback,
            Command.SendHapticFeedback,
            () => this.commands.sendHapticFeedback(payload)
          );
          return resolve(response);
        } catch (error) {
          reject(error);
        }
      });
    },
  };
}
