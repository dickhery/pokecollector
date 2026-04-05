import type { Principal } from "@icp-sdk/core/principal";
export interface Some<T> {
    __kind__: "Some";
    value: T;
}
export interface None {
    __kind__: "None";
}
export type Option<T> = Some<T> | None;
export interface http_header {
    value: string;
    name: string;
}
export interface PokemonCard {
    id: string;
    setName: string;
    types: Array<string>;
    name: string;
    setId: string;
    imageUrl: string;
    number: string;
    quantity: bigint;
    marketPrice: number;
    rarity: string;
    cardId: string;
    customValue?: number;
    dateAdded: bigint;
    condition: string;
}
export interface TransformationOutput {
    status: bigint;
    body: Uint8Array;
    headers: Array<http_header>;
}
export interface TransformationInput {
    context: Uint8Array;
    response: http_request_result;
}
export interface CardUpdate {
    setName: string;
    types: Array<string>;
    name: string;
    setId: string;
    imageUrl: string;
    number: string;
    quantity: bigint;
    marketPrice: number;
    rarity: string;
    cardId: string;
    customValue?: number;
    condition: string;
}
export interface http_request_result {
    status: bigint;
    body: Uint8Array;
    headers: Array<http_header>;
}
export enum UserRole {
    admin = "admin",
    user = "user",
    guest = "guest"
}
export interface backendInterface {
    addCard(card: CardUpdate): Promise<PokemonCard>;
    analyzeCardImage(base64Image: string): Promise<string>;
    assignCallerUserRole(user: Principal, role: UserRole): Promise<void>;
    getAllUsers(): Promise<Array<Principal>>;
    getCallerUserRole(): Promise<UserRole>;
    getCollection(): Promise<Array<PokemonCard>>;
    getVisionApiKey(): Promise<string>;
    isCallerAdmin(): Promise<boolean>;
    removeCard(id: string): Promise<boolean>;
    setVisionApiKey(key: string): Promise<void>;
    transform(input: TransformationInput): Promise<TransformationOutput>;
    updateCard(id: string, updates: CardUpdate): Promise<PokemonCard>;
}
