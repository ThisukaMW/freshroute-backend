import prisma from "../../config/database.js";

const today = new Date()
const startOfToday = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate()
)

const startOfYesterday = new Date(startOfToday)
startOfYesterday.setDate(startOfYesterday.getDate() - 1)

const getOrdersForAggregator = async () => {
    const orders = await prisma.order.findMany({
        where: {
            status: "PAID",
            placedAt: {
                gte: startOfYesterday,
                lt: startOfToday
            },
            batchId: null
        }
    });

    const trucks = await prisma.driver
    
    
    return orders;
}

