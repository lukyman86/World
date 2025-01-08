import Safe, { hashSafeMessage } from '@safe-global/protocol-kit';
import {
  MiniKit,
  ResponseEvent,
  SignMessageErrorCodes,
  SignMessageInput,
} from '@worldcoin/minikit-js';
import { useCallback, useEffect, useState } from 'react';
import * as yup from 'yup';
import { validateSchema } from './helpers/validate-schema';

const signMessageSuccessPayloadSchema = yup.object({
  status: yup.string<'success'>().oneOf(['success']),
  signature: yup.string().required(),
  address: yup.string().required(),
});

const signMessageErrorPayloadSchema = yup.object({
  error_code: yup
    .string<SignMessageErrorCodes>()
    .oneOf(Object.values(SignMessageErrorCodes))
    .required(),
  status: yup.string<'error'>().equals(['error']).required(),
  version: yup.number().required(),
});

export const SignMessage = () => {
  const [signMessageAppPayload, setSignMessageAppPayload] = useState<
    string | undefined
  >();

  const [
    signMessagePayloadValidationMessage,
    setSignMessagePayloadValidationMessage,
  ] = useState<string | null>();

  const [
    signMessagePayloadVerificationMessage,
    setSignMessagePayloadVerificationMessage,
  ] = useState<string | null>();

  const [sentSignMessagePayload, setSentSignMessagePayload] = useState<Record<
    string,
    any
  > | null>(null);
  const [tempInstallFix, setTempInstallFix] = useState(0);
  const messageToSign = 'hello world';

  useEffect(() => {
    if (!MiniKit.isInstalled()) {
      return;
    }

    MiniKit.subscribe(ResponseEvent.MiniAppSignMessage, async (payload) => {
      console.log('MiniAppSignMessage, SUBSCRIBE PAYLOAD', payload);
      setSignMessageAppPayload(JSON.stringify(payload, null, 2));
      if (payload.status === 'error') {
        const errorMessage = await validateSchema(
          signMessageErrorPayloadSchema,
          payload,
        );

        if (!errorMessage) {
          setSignMessagePayloadValidationMessage('Payload is valid');
        } else {
          setSignMessagePayloadValidationMessage(errorMessage);
        }
      } else {
        const errorMessage = await validateSchema(
          signMessageSuccessPayloadSchema,
          payload,
        );

        // This checks if the response format is correct
        if (!errorMessage) {
          setSignMessagePayloadValidationMessage('Payload is valid');
        } else {
          setSignMessagePayloadValidationMessage(errorMessage);
        }

        const messageHash = hashSafeMessage(messageToSign);

        const isValid = await (
          await Safe.init({
            provider:
              'https://opt-mainnet.g.alchemy.com/v2/Ha76ahWcm6iDVBU7GNr5n-ONLgzWnkWc',
            safeAddress: payload.address,
          })
        ).isValidSignature(messageHash, payload.signature);

        // Checks functionally if the signature is correct
        if (isValid) {
          setSignMessagePayloadVerificationMessage('Signature is valid');
        } else {
          setSignMessagePayloadVerificationMessage(
            'Signature is invalid (We are verifying on optimism, if you are using worldchain message andy',
          );
        }
      }
    });

    return () => {
      MiniKit.unsubscribe(ResponseEvent.MiniAppSignMessage);
    };
  }, [tempInstallFix]);

  const onSignMessage = useCallback(async () => {
    const signMessagePayload: SignMessageInput = {
      message: messageToSign,
    };

    const payload = MiniKit.commands.signMessage(signMessagePayload);
    setSentSignMessagePayload({
      payload,
    });
    setTempInstallFix((prev) => prev + 1);
  }, [messageToSign]);

  return (
    <div>
      <div className="grid gap-y-2">
        <h2 className="text-2xl font-bold">Sign Message</h2>

        <div>
          <div className="bg-gray-300 min-h-[100px] p-2">
            <pre className="break-all whitespace-break-spaces">
              {JSON.stringify(sentSignMessagePayload, null, 2)}
            </pre>
          </div>
        </div>
        <button
          className="bg-black text-white rounded-lg p-4 w-full"
          onClick={onSignMessage}
        >
          Sign Message
        </button>
      </div>

      <hr />

      <div className="w-full grid gap-y-2">
        <p>Message from &quot;{ResponseEvent.MiniAppSignMessage}&quot; </p>

        <div className="bg-gray-300 min-h-[100px] p-2">
          <pre className="break-all whitespace-break-spaces">
            {signMessageAppPayload ?? JSON.stringify(null)}
          </pre>
        </div>

        <div className="grid gap-y-2">
          <p>Response Validation:</p>
          <p className="bg-gray-300 p-2">
            {signMessagePayloadValidationMessage ?? 'No validation'}
          </p>
        </div>
        <div>
          <p>Check does signature verify:</p>
          <p className="bg-gray-300 p-2">
            {signMessagePayloadVerificationMessage ?? 'No verification'}
          </p>
        </div>
      </div>
    </div>
  );
};
