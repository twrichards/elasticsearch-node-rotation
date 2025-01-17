import {AddNodeResponse, OldAndNewNodeResponse} from './utils/handlerInputs';
import {Elasticsearch} from './elasticsearch/elasticsearch';
import {getSpecificInstance} from './aws/ec2Instances';
import {ElasticsearchClusterStatus, ElasticsearchNode} from './elasticsearch/types';
import {Instance} from './aws/types';
import {getASG} from "./aws/autoscaling";

export async function handler(event: AddNodeResponse): Promise<OldAndNewNodeResponse> {

    const asg = await getASG(event.asgName)
    const instanceIds = asg.Instances.map(i  => i.InstanceId)
    const newestInstance = await getSpecificInstance(instanceIds, findNewestInstance)
    const elasticsearchClient = new Elasticsearch(event.oldestElasticsearchNode.ec2Instance.id)
    const newestNode = elasticsearchClient.getElasticsearchNode(newestInstance)

    return new Promise<OldAndNewNodeResponse>((resolve, reject) => {
        elasticsearchClient.getClusterHealth()
            .then((clusterStatus: ElasticsearchClusterStatus) => {
                const nodesInCluster = clusterStatus.number_of_nodes;
                if (nodesInCluster === event.expectedClusterSize) {
                    return newestNode;
                } else {
                    const error = `Found ${nodesInCluster} nodes but expected to find ${event.expectedClusterSize}`;
                    console.log(error);
                    reject(error)
                }
            })
            .then( (newestElasticsearchNode: ElasticsearchNode) => {
                const response: OldAndNewNodeResponse = {
                    "asgName": event.asgName,
                    "oldestElasticsearchNode": event.oldestElasticsearchNode,
                    "newestElasticsearchNode": newestElasticsearchNode
                };
                resolve(response);
            })
            .catch( error => {
                console.log(`Failed to get cluster status due to: ${error}`);
                reject(error)
            })
    })
}

function findNewestInstance(instances: Instance[]): Instance {
    const sortedInstances: Instance[] = instances.sort(function(a,b){return a.launchTime.getTime() - b.launchTime.getTime()}).reverse();
    const newestInstance: Instance = sortedInstances[0];
    console.log(`Newest instance ${newestInstance.id} was launched at ${newestInstance.launchTime}`);
    return newestInstance;
}
