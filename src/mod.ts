import type { DependencyContainer } from "tsyringe";
import type { IPostDBLoadMod } from "@spt/models/external/IPostDBLoadMod";
import type { DatabaseServer } from "@spt/servers/DatabaseServer";
import type { ILogger } from "@spt/models/spt/utils/ILogger";
import { BaseClasses } from "@spt/models/enums/BaseClasses";
import { LogTextColor } from "@spt/models/spt/logging/LogTextColor";
import type { ITemplateItem } from "@spt/models/eft/common/tables/ITemplateItem";

import cases from "../config/config.json";

const THERAPIST_ID = "54cb57776803fa99248b456e";
const ROUBLES_ID = "5449016a4bdc2d6f028b456f";

const conflictingItems: string[] = [
    "59e770f986f7742cbe3164ef",
    "572b7d8524597762b472f9d1",
    "5aa2b87de5b5b00016327c25",
    "5aa2a7e8e5b5b00016327c16",
    "5a43943586f77416ad2f06e2",
    "5aa2b89be5b5b0001569311f",
    "5aa2b8d7e5b5b00014028f4a",
    "5a43957686f7742a2c2f11b0",
    "5aa2ba46e5b5b000137b758d",
    "5aa2b9ede5b5b000137b758b",
    "5aa2ba19e5b5b00014028f4e",
    "5c066ef40db834001966a595",
    "5a16bb52fcdbcb001a3b00dc",
    "5f99418230835532b445e954",
    "5b4329f05acfc47a86086aa1",
    "5b43271c5acfc432ff4dce65",
    "5b40e5e25acfc4001a599bea",
    "5f60e6403b85f6263c14558c",
    "5f60e7788adaa7100c3adb49",
    "5f60e784f2bcbb675b00dac7",
    "5d96141523f0ea1b7f2aacab",
    "5b4327aa5acfc400175496e0",
    "5b4329075acfc400153b78ff",
    "5f994730c91ed922dd355de3",
    "5b40e61f5acfc4001a599bec",
    "5c0d2727d174af02a012cf58",
    "59ef13ca86f77445fd0e2483",
    "5aa7e373e5b5b000137b76f0",
    "5a16ba61fcdbcb098008728a",
    "5a16b672fcdbcb001912fa83",
    "5a16b7e1fcdbcb00165aa6c9",
    "5aa7e3abe5b5b000171d064d",
    "5c178a942e22164bef5ceca3",
    "5ac4c50d5acfc40019262e87",
    "5b46238386f7741a693bcf9c",
    "5d6d3829a4b9361bc8618943",
    "5c0919b50db834001b7ce3b9",
    "5c0e842486f77443a74d2976",
    "5e00cdd986f7747473332240",
    "5e01f37686f774773c6f6c15",
    "5ca2113f86f7740b2547e1d2",
    "65709d2d21b9f815e208ff95",
    "65749cb8e0423b9ebe0c79c9",
    "65749ccf33fdc9c0cf06d3ca",
    "5f60c85b58eff926626a60f7",
    "5f60bf4558eff926626a60f2",
    "5f60c076f2bcbb675b00dac2",
    "5c08f87c0db8340019124324",
    "5c0696830db834001d23f5da"
];

interface ItemModification {
    id: string;
    modify: (item: ITemplateItem) => void;
}

class Mod implements IPostDBLoadMod {
    private static readonly CASE_ID_MAP = {
        CollectorCase: "7f2ad48631e4c08eb3a8597d"
    };

    private readonly modName = "CollectorCase";
    private container: DependencyContainer;
    private logger: ILogger;

    public postDBLoad(container: DependencyContainer): void {
        this.container = container;
        this.logger = container.resolve<ILogger>("WinstonLogger");
        this.logger.log(`[${this.modName}] : Mod loading`, LogTextColor.WHITE);

        const databaseServer = container.resolve<DatabaseServer>("DatabaseServer");
        const tables = databaseServer.getTables();
        
        Object.values(cases).forEach(caseConfig => {
            // Skip if trader is not Therapist
            if (caseConfig.trader !== "therapist") return;
            this.createCase(caseConfig, tables);
        });

        this.solveSpecificIncompatibilities(tables);

    }

    private static readonly ITEM_MODIFICATIONS: ItemModification[] = [
        {
            id: "5bd073c986f7747f627e796c", // Kotton beanie
            modify: (item) => {
                item._props.BlocksHeadwear = false;
            }
        },
        {
            id: "5e54f79686f7744022011103", // Pestily plague mask
            modify: (item) => {
                item._props.ConflictingItems = conflictingItems;
            }
        }      
    ];

    private solveSpecificIncompatibilities(tables: any): void {
        const itemDB = tables.templates.items;
        
        const modificationMap = new Map(
            Mod.ITEM_MODIFICATIONS.map(mod => [mod.id, mod.modify])
        );

        Object.values(itemDB).forEach(item => {
            const modifier = modificationMap.get(item._id);
            if (modifier) {
                modifier(item);
            }
        });
    }

    private createCase(caseConfig: any, tables: any): void {
        const templateId = Mod.CASE_ID_MAP[caseConfig.id];
        if (!templateId) return;

        const item = this.createBaseItem(caseConfig, tables.templates.items);
        item._id = templateId;
        item._props.Prefab.path = "CollectorCase/case.bundle";

        if (caseConfig.case_type === "slots") {
            item._props.Slots = this.createSlots(caseConfig.slot_ids);
        }

        // Update item properties
        Object.assign(item._props, {
            Width: caseConfig.ExternalSize.width,
            Height: caseConfig.ExternalSize.height,
            CanSellOnRagfair: !caseConfig.flea_banned,
            InsuranceDisabled: !caseConfig.insurance_enabled
        });

        // Update tables
        tables.templates.items[templateId] = item;
        this.updateLocales(templateId, caseConfig, tables.locales.global);
        this.updateHandbook(templateId, caseConfig.flea_price, tables.templates.handbook);
        this.updateContainerPermissions(templateId, caseConfig, tables.templates.items);
        this.addToTrader(templateId, caseConfig, tables.traders[THERAPIST_ID]);
    }

    private createBaseItem(config: any, items: any): any {
        if (config.case_type === "slots") {
            const baseItem = structuredClone(items["5a9d6d00a2750c5c985b5305"]);
            baseItem._props.IsAlwaysAvailableForInsurance = true;
            baseItem._props.DiscardLimit = -1;
            baseItem._props.ItemSound = config.sound;
            //baseItem._props.MergesWithChildren = false;
            //baseItem._props.NotShownInSlot = false;
            return baseItem;
        }
        return {};
    }

    private createSlots(slotIds: string[]): any[] {
        return slotIds.map((slotId, index) => ({
            _name: `mod_mount_${index}`,
            _id: this.container.resolve<any>("HashUtil").generate(),
            _parent: Mod.CASE_ID_MAP.Collectors_Case,
            _props: {
                filters: [{
                    Filter: [slotId],
                    ExcludedFilter: []
                }],
                _required: false,
                _mergeSlotWithChildren: false
            }
        }));
    }

    private updateLocales(templateId: string, config: any, locales: Record<string, Record<string, string>>): void {
        Object.values(locales).forEach(locale => {
            locale[`${templateId} Name`] = config.item_name;
            locale[`${templateId} ShortName`] = config.item_short_name;
            locale[`${templateId} Description`] = config.item_description;
        });
    }

    private updateHandbook(templateId: string, price: number, handbook: any): void {
        handbook.Items.push({
            Id: templateId,
            ParentId: "5b5f6fa186f77409407a7eb7",
            Price: price
        });
    }

    private updateContainerPermissions(
        itemId: string, 
        config: any, 
        items: Record<string, ITemplateItem>
    ): void {
        Object.values(items).forEach(item => {
            if (item._type !== "Item") return;

            if (config.allow_in_secure_containers && item._parent === BaseClasses.MOB_CONTAINER) {
                this.updateFilters(item, itemId, true);
            }

            if (config.case_allowed_in?.includes(item._id)) {
                this.updateFilters(item, itemId, true);
            }
        });
    }

    private updateFilters(item: ITemplateItem, itemId: string, isInclude: boolean): void {
        if (!item._props.Grids) return;
        
        item._props.Grids.forEach(grid => {
            const filterArray = isInclude ? 'Filter' : 'ExcludedFilter';
            if (!grid._props.filters[0]) {
                grid._props.filters[0] = { Filter: [], ExcludedFilter: [] };
            }
            if (!grid._props.filters[0][filterArray]) {
                grid._props.filters[0][filterArray] = [];
            }
            if (!grid._props.filters[0][filterArray].includes(itemId)) {
                grid._props.filters[0][filterArray].push(itemId);
            }
        });
    }

    private addToTrader(templateId: string, config: any, trader: any): void {
        if (!trader) {
            this.logger.error(`[${this.modName}] : Could not find Therapist trader`);
            return;
        }

        trader.assort.items.push({
            _id: templateId,
            _tpl: templateId,
            parentId: "hideout",
            slotId: "hideout",
            upd: {
                UnlimitedCount: config.unlimited_stock,
                StackObjectsCount: config.stock_amount
            }
        });

        trader.assort.barter_scheme[templateId] = [[{
            count: config.price,
            _tpl: ROUBLES_ID
        }]];

        trader.assort.loyal_level_items[templateId] = config.trader_loyalty_level;
    }
}

module.exports = { mod: new Mod() };