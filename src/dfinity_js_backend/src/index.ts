import { query, update, text, Record, StableBTreeMap, Variant, Vec, None, Some, Ok, Err, ic, Principal, Opt, nat64, Duration, Result, bool, Canister } from "azle";
import { Ledger, binaryAddressFromAddress, binaryAddressFromPrincipal, hexAddressFromPrincipal } from "azle/canisters/ledger";
import { hashCode } from "hashcode";
import { v4 as uuidv4 } from "uuid";


// Define the structure of the GymService payload
const GymServicePayload = Record({
    gymId: text,
    serviceName: text,
    serviceDescription: text,
    operatingDaysStart: text,
    operatingDaysEnd: text
});

// Define the structure of the Membership payload
const MembershipPayload = Record({
    fullName: text,
    userName: text,
    emailAddress: text,
    userId: text,
    gymId: text
});



// Define the structure of the Gym object
const Gym = Record({
    id: text,
    owner: Principal,
    gymName: text,
    gymImgUrl: text,
    gymLocation: text,
    gymDescription: text,
    emailAddress: text,
    members: Vec(MembershipPayload),
    gymServices: Vec(GymServicePayload)
});



// Define the structure of the Gym payload for creation/updating
const GymPayload = Record({
    gymName: text,
    gymImgUrl: text,
    gymLocation: text,
    gymDescription: text,
    emailAddress: text
});



// Define the possible message variants for errors and notifications
const Message = Variant({
    NotFound: text,
    InvalidPayload: text,
    PaymentFailed: text,
    PaymentCompleted: text,
    AlreadyExist: text,
    NotAuthorized: text
});



const gymStorage = StableBTreeMap(0, text, Gym);


const ORDER_RESERVATION_PERIOD = 120n; // reservation period in seconds

const icpCanister = Ledger(Principal.fromText("ryjl3-tyaaa-aaaaa-aaaba-cai"));

export default Canister({

    // Query to get all gyms
    getAllGym: query([], Vec(Gym), () => {
        return gymStorage.values();
    }),


    // Query to get a specific gym by ID
    getGymById: query([text], Result(Gym, Message), (id) => {
        const gym = gymStorage.get(id);
        if ("None" in gym) {
            return Err({ NotFound: `gym with id=${id} not found` });
        }
        return Ok(gym.Some);
    }),


    // Update method to create a new gym profile
    createGymProfile: update([GymPayload], Result(Gym, Message), (payload) => {
        if (!payload.gymName || !payload.gymImgUrl || !payload.gymLocation || !payload.gymDescription || !payload.emailAddress) {
            return Err({ InvalidPayload: "Missing required fields" });
        }

        const gym = { id: uuidv4(), owner: ic.caller(), members: [], gymServices: [], ...payload };

        gymStorage.insert(gym.id, gym);
        return Ok(gym);
    }),



    // Update method to update an existing gym by ID
    updateGymById: update([text, GymPayload], Result(Gym, Message), (id, payload) => {
        const gymOpt = gymStorage.get(id);
        if ("None" in gymOpt) {
            return Err({ NotFound: `cannot update gym: gym with id=${id} not found` });
        }

        if (gymOpt.Some.owner.toText() !== ic.caller().toText()) {
            return Err({ NotAuthorized: `you are not the owner of this gym with id=${id} ` });
        }

        const existingGym = gymOpt.Some;

        const updatedGym = {
            ...existingGym,
            gymName: payload.gymName,
            gymImgUrl: payload.gymImgUrl,
            gymLocation: payload.gymLocation,
            gymDescription: payload.gymDescription,
            emailAddress: payload.emailAddress,
        };

        gymStorage.insert(id, updatedGym);
        return Ok(updatedGym);
    }),



    // Update method to register a new gym member
    gymMembershipRegistration: update([MembershipPayload], Result(Gym, Message), (payload) => {
        if (!payload.fullName || !payload.userName || !payload.emailAddress) {
            return Err({ InvalidPayload: "Missing required fields" });
        }

        const { gymId, fullName, userName, emailAddress } = payload;

        const gymOpt = gymStorage.get(gymId);

        if ("None" in gymOpt) {
            return Err({ NotFound: `Gym with id=${gymId} not found` });
        }

        for (const item of gymOpt.Some.members) {
            if (item.userId.toText() === ic.caller().toText()) {
                return Err({ AlreadyExist: "user already exists" });
            }
        }

        gymOpt.Some.members.push({ userId: ic.caller().toText(), userName, gymId, fullName, emailAddress });

        gymStorage.insert(gymId, gymOpt.Some);

        return Ok(gymOpt.Some);
    }),



    // Query to get all members enrolled in a specific gym by ID
    getAllEnrollesByGymId: query([text], Result(Vec(MembershipPayload), Message), (id) => {
        const gymOpt = gymStorage.get(id);
        if ("None" in gymOpt) {
            return Err({ NotFound: `gym with id=${id} not found` });
        }

        let newMembers: any[] = [];
        gymOpt.Some.members.forEach((item: { gymId: any }) => {
            if (item.gymId === id) {
                newMembers.push(item);
            }
        });
        return Ok(newMembers);
    }),



    // Update method to add a new service to a gym
    addGymService: update([GymServicePayload], Result(Gym, Message), (payload) => {
        if (!payload.serviceName || !payload.serviceDescription || !payload.operatingDaysStart || !payload.operatingDaysEnd) {
            return Err({ InvalidPayload: "Missing required fields" });
        }

        const { gymId, serviceName, serviceDescription, operatingDaysStart, operatingDaysEnd } = payload;
        const gymOpt = gymStorage.get(gymId);

        if ("None" in gymOpt) {
            return Err({ NotFound: `Gym with id=${gymId} not found` });
        }

        if (gymOpt.Some.owner.toText() !== ic.caller().toText()) {
            return Err({ NotAuthorized: `you are not the owner of this gym with id=${gymId} ` });
        }

        gymOpt.Some.gymServices.push({ gymId, serviceName, serviceDescription, operatingDaysStart, operatingDaysEnd });
        gymStorage.insert(gymId, gymOpt.Some);
        return Ok(gymOpt.Some);
    }),



    // Query to get all services of a specific gym by ID
    getAllServicesById: query([text], Result(Vec(GymServicePayload), Message), (id) => {
        const gymOpt = gymStorage.get(id);
        if ("None" in gymOpt) {
            return Err({ NotFound: `gym with id=${id} not found` });
        }

        let services: any[] = [];
        gymOpt.Some.gymServices.forEach((service: { gymId: any }) => {
            if (service.gymId === id) {
                services.push(service);
            }
        });
        return Ok(services);
    }),



    // Update method to delete a gym by ID
    deleteGymById: update([text], Result(text, Message), (id) => {
        const deletedGymOpt = gymStorage.remove(id);
        if ("None" in deletedGymOpt) {
            return Err({ NotFound: `cannot delete the gym: gym with id=${id} not found` });
        }

        if (deletedGymOpt.Some.owner.toText() !== ic.caller().toText()) {
            return Err({ NotAuthorized: `you are not the owner of this gym with id=${id} ` });
        }

        return Ok(deletedGymOpt.Some.id);
    }),


    verifyPayment: query([Principal, nat64, nat64, nat64], bool, async (receiver, amount, block, memo) => {
        return await verifyPaymentInternal(receiver, amount, block, memo);
    }),

    /*
        a helper function to get address from the principal
        the address is later used in the transfer method
    */
    getAddressFromPrincipal: query([Principal], text, (principal) => {
        return hexAddressFromPrincipal(principal, 0);
    }),

    // not used right now. can be used for transfers from the canister for instances when a marketplace can hold a balance account for users
    makePayment: update([text, nat64], Result(Message, Message), async (to, amount) => {
        const toPrincipal = Principal.fromText(to);
        const toAddress = hexAddressFromPrincipal(toPrincipal, 0);
        const transferFeeResponse = await ic.call(icpCanister.transfer_fee, { args: [{}] });
        const transferResult = ic.call(icpCanister.transfer, {
            args: [{
                memo: 0n,
                amount: {
                    e8s: amount
                },
                fee: {
                    e8s: transferFeeResponse.transfer_fee.e8s
                },
                from_subaccount: None,
                to: binaryAddressFromAddress(toAddress),
                created_at_time: None
            }]
        });
        if ("Err" in transferResult) {
            return Err({ PaymentFailed: `payment failed, err=${transferResult.Err}` })
        }
        return Ok({ PaymentCompleted: "payment completed" });
    })

})

function hash(input: any): nat64 {
    return BigInt(Math.abs(hashCode().value(input)));
};



// a workaround to make uuid package work with Azle
globalThis.crypto = {
    // @ts-ignore
    getRandomValues: () => {
        let array = new Uint8Array(32);

        for (let i = 0; i < array.length; i++) {
            array[i] = Math.floor(Math.random() * 256);
        }

        return array;
    }
};

function generateCorrelationId(gymId: text): nat64 {
    const correlationId = `${gymId}_${ic.caller().toText()}_${ic.time()}`;
    return hash(correlationId);
};

function discardByTimeout(memo: nat64, delay: Duration) {
    ic.setTimer(delay, () => {
        const order = gymStorage.remove(memo);
        console.log(`Order discarded ${order}`);
    });
};

async function verifyPaymentInternal(receiver: Principal, amount: nat64, block: nat64, memo: nat64): Promise<bool> {
    const blockData = await ic.call(icpCanister.query_blocks, { args: [{ start: block, length: 1n }] });
    const tx = blockData.blocks.find((block) => {
        if ("None" in block.transaction.operation) {
            return false;
        }
        const operation = block.transaction.operation.Some;
        const senderAddress = binaryAddressFromPrincipal(ic.caller(), 0);
        const receiverAddress = binaryAddressFromPrincipal(receiver, 0);
        return block.transaction.memo === memo &&
            hash(senderAddress) === hash(operation.Transfer?.from) &&
            hash(receiverAddress) === hash(operation.Transfer?.to) &&
            amount === operation.Transfer?.amount.e8s;
    });
    return tx ? true : false;
};