import {
  contentCardIdPayloadSchema,
  createContentCardPayloadSchema,
  getContentCardsPayloadSchema,
  saveContentCardMediaPayloadSchema,
  setContentSocialAccountPayloadSchema,
  updateContentCardPayloadSchema,
  type ContentCard,
  type ContentCardIdPayload,
  type ContentCardMediaItem,
  type ContentPublishAttempt,
  type ContentSocialAccount,
  type CreateContentCardPayload,
  type GetContentCardsPayload,
  type SaveContentCardMediaPayload,
  type SetContentSocialAccountPayload,
  type UpdateContentCardPayload,
} from "../../contracts";
import { defineNoArgProcedure, definePayloadProcedure } from "../core";

export const contentCardProcedures = {
  getContentCards: definePayloadProcedure<GetContentCardsPayload, ContentCard[], "main-local">(
    "getContentCards",
    "main-local",
    getContentCardsPayloadSchema,
  ),
  createContentCard: definePayloadProcedure<CreateContentCardPayload, ContentCard, "main-local">(
    "createContentCard",
    "main-local",
    createContentCardPayloadSchema,
  ),
  updateContentCard: definePayloadProcedure<
    UpdateContentCardPayload,
    ContentCard | null,
    "main-local"
  >("updateContentCard", "main-local", updateContentCardPayloadSchema),
  deleteContentCard: definePayloadProcedure<ContentCardIdPayload, void, "main-local">(
    "deleteContentCard",
    "main-local",
    contentCardIdPayloadSchema,
  ),
  saveContentCardMedia: definePayloadProcedure<
    SaveContentCardMediaPayload,
    ContentCardMediaItem,
    "main-local"
  >("saveContentCardMedia", "main-local", saveContentCardMediaPayloadSchema),
  getContentSocialAccounts: defineNoArgProcedure<ContentSocialAccount[], "main-local">(
    "getContentSocialAccounts",
    "main-local",
  ),
  setContentSocialAccount: definePayloadProcedure<
    SetContentSocialAccountPayload,
    void,
    "main-local"
  >("setContentSocialAccount", "main-local", setContentSocialAccountPayloadSchema),
  /** Launch a background publish thread for one card — no chat navigation. */
  publishContentCard: definePayloadProcedure<ContentCardIdPayload, void, "main-local">(
    "publishContentCard",
    "main-local",
    contentCardIdPayloadSchema,
  ),
  /** Append-oriented publish history — survives card edits and deletion. */
  getContentPublishAttempts: defineNoArgProcedure<ContentPublishAttempt[], "main-local">(
    "getContentPublishAttempts",
    "main-local",
  ),
} as const;
