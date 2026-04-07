import Map "mo:core/Map";
import Text "mo:core/Text";
import Time "mo:core/Time";
import Float "mo:core/Float";
import Runtime "mo:core/Runtime";
import Outcall "http-outcalls/outcall";
import BlobStorage "blob-storage/Storage";

import MixinStorage "blob-storage/Mixin";
import MixinAuthorization "authorization/MixinAuthorization";
import AccessControl "authorization/access-control";


actor {
  // Card type definition
  type PokemonCard = {
    id : Text;
    cardId : Text;
    name : Text;
    imageUrl : Text;
    setName : Text;
    setId : Text;
    number : Text;
    rarity : Text;
    types : [Text];
    marketPrice : Float;
    customValue : ?Float;
    quantity : Nat;
    condition : Text;
    dateAdded : Int;
  };

  type CardUpdate = {
    cardId : Text;
    name : Text;
    imageUrl : Text;
    setName : Text;
    setId : Text;
    number : Text;
    rarity : Text;
    types : [Text];
    marketPrice : Float;
    customValue : ?Float;
    quantity : Nat;
    condition : Text;
  };

  // Vision API Key Management
  // `stable` so the key survives canister upgrades.
  // Default is empty -- no hardcoded key in source.
  // Admin must call setVisionApiKey() via the admin dashboard to configure it.
  stable var visionApiKey : Text = "";
  stable var nextId = 0;

  // Stable storage for user collections
  let userCollections = Map.empty<Principal, Map.Map<Text, PokemonCard>>();

  // Include storage mixin for blob storage
  include MixinStorage();

  // Authorization mixin
  // Note: isCallerAdmin() is already provided by MixinAuthorization -- do not redefine it here.
  let accessControlState = AccessControl.initState();
  include MixinAuthorization(accessControlState);

  // Analyze card image using Vision API
  // Features: DOCUMENT_TEXT_DETECTION (dense OCR) + WEB_DETECTION (visual web matching)
  // imageContext enables per-symbol confidence scores for better post-processing
  public query func transform(input : Outcall.TransformationInput) : async Outcall.TransformationOutput {
    Outcall.transform(input);
  };

  public shared ({ caller }) func analyzeCardImage(base64Image : Text) : async Text {
    if (not (AccessControl.hasPermission(accessControlState, caller, #user))) {
      Runtime.trap("Unauthorized: Only users can analyze card images");
    };

    // Return a structured error if no key has been configured yet.
    // The frontend reads this JSON and surfaces a clear message to the user.
    if (visionApiKey == "") {
      return "{\"error\":{\"code\":400,\"message\":\"Vision API key is not configured. An admin must set it via the admin dashboard.\",\"status\":\"FAILED_PRECONDITION\"}}";
    };

    let url = "https://vision.googleapis.com/v1/images:annotate?key=" # visionApiKey;

    // Using three complementary features:
    //   DOCUMENT_TEXT_DETECTION -- dense OCR optimised for documents/cards; returns
    //     fullTextAnnotation with per-block/word/symbol structure and confidence.
    //   WEB_DETECTION -- visual web-entity matching; the most reliable way to
    //     identify the exact card by appearance even when OCR is imperfect.
    //
    // imageContext.textDetectionParams.enableTextDetectionConfidenceScore = true
    //   asks Vision to attach confidence values to each OCR symbol so the frontend
    //   can judge how trustworthy the OCR result is.
    let body = "{\"requests\":[{\"image\":{\"content\":\"" # base64Image # "\"},\"features\":[{\"type\":\"DOCUMENT_TEXT_DETECTION\",\"maxResults\":1},{\"type\":\"WEB_DETECTION\",\"maxResults\":10}],\"imageContext\":{\"textDetectionParams\":{\"enableTextDetectionConfidenceScore\":true}}}]}";
    let headers : [Outcall.Header] = [{ name = "Content-Type"; value = "application/json" }];
    await Outcall.httpPostRequest(url, headers, body, transform);
  };

  // Vision API Key Management
  public shared ({ caller }) func setVisionApiKey(key : Text) : async () {
    if (not (AccessControl.hasPermission(accessControlState, caller, #admin))) {
      Runtime.trap("Unauthorized: Only admins can set Vision API key");
    };
    visionApiKey := key;
  };

  // Returns "(not set)" or "(configured)" -- never the raw key value.
  // This prevents accidental key exposure in logs or UI while still letting
  // the admin page show whether a key has been configured.
  public query ({ caller }) func getVisionApiKey() : async Text {
    if (not (AccessControl.hasPermission(accessControlState, caller, #admin))) {
      Runtime.trap("Unauthorized: Only admins can get Vision API key");
    };
    if (visionApiKey == "") {
      return "(not set)";
    };
    return "(configured)";
  };

  // Card collection management
  public query ({ caller }) func getCollection() : async [PokemonCard] {
    if (not (AccessControl.hasPermission(accessControlState, caller, #user))) {
      Runtime.trap("Unauthorized: Only users can view collections");
    };
    switch (userCollections.get(caller)) {
      case (?collection) { collection.values().toArray() };
      case (null) { [] };
    };
  };

  public shared ({ caller }) func addCard(card : CardUpdate) : async PokemonCard {
    if (not (AccessControl.hasPermission(accessControlState, caller, #user))) {
      Runtime.trap("Unauthorized: Only users can add cards");
    };

    let id = nextId.toText();
    nextId += 1;
    let dateAdded = Time.now();

    let newCard : PokemonCard = {
      card with
      id;
      dateAdded;
    };

    let userCollection = switch (userCollections.get(caller)) {
      case (null) { Map.empty<Text, PokemonCard>() };
      case (?collection) { collection };
    };

    userCollection.add(id, newCard);
    userCollections.add(caller, userCollection);
    newCard;
  };

  public shared ({ caller }) func updateCard(id : Text, updates : CardUpdate) : async PokemonCard {
    if (not (AccessControl.hasPermission(accessControlState, caller, #user))) {
      Runtime.trap("Unauthorized: Only users can update cards");
    };

    switch (userCollections.get(caller)) {
      case (null) { Runtime.trap("Card not found") };
      case (?collection) {
        switch (collection.get(id)) {
          case (null) { Runtime.trap("Card not found") };
          case (?existingCard) {
            let updatedCard : PokemonCard = {
              updates with
              id = existingCard.id;
              dateAdded = existingCard.dateAdded;
            };
            collection.add(id, updatedCard);
            updatedCard;
          };
        };
      };
    };
  };

  public shared ({ caller }) func removeCard(id : Text) : async Bool {
    if (not (AccessControl.hasPermission(accessControlState, caller, #user))) {
      Runtime.trap("Unauthorized: Only users can remove cards");
    };

    switch (userCollections.get(caller)) {
      case (null) { false };
      case (?collection) {
        if (not collection.containsKey(id)) { return false };
        collection.remove(id);
        true;
      };
    };
  };

  // Admin function to get all user principals with collections
  public query ({ caller }) func getAllUsers() : async [Principal] {
    if (not (AccessControl.hasPermission(accessControlState, caller, #admin))) {
      Runtime.trap("Unauthorized: Only admins can get all users");
    };
    userCollections.keys().toArray();
  };
};
